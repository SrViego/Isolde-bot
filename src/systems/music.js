const { Readable } = require('node:stream');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType
} = require('@discordjs/voice');
const { PermissionFlagsBits } = require('discord.js');
const { getInnertube } = require('./youtube');

const MUSIC_COMMANDS = [
  '!play',
  '!p',
  '!skip',
  '!stop',
  '!queue',
  '!fila',
  '!pause',
  '!resume',
  '!continuar',
  '!np',
  '!tocando',
  '!volume'
];

/** @type {Map<string, object>} */
const guildQueues = new Map();

const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YT_URL_ID_RE =
  /(?:youtube\.com\/watch\?[^#]*?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

const DOWNLOAD_OPTIONS = { type: 'audio', quality: 'best', format: 'any' };

const ERR_NO_AUDIO_FORMAT =
  'Não consegui obter áudio deste vídeo. O YouTube pode estar bloqueando o bot ou o vídeo não permite reprodução. Tenta outro link.';

function patchVoiceConnection(connection) {
  if (connection.__isoldePatched) return;
  connection.__isoldePatched = true;

  connection.on('stateChange', (oldState, newState) => {
    if (
      oldState.status === VoiceConnectionStatus.Ready &&
      newState.status === VoiceConnectionStatus.Connecting
    ) {
      connection.configureNetworking();
    }
  });
}

function getQueue(guildId) {
  if (!guildQueues.has(guildId)) {
    guildQueues.set(guildId, {
      tracks: [],
      player: createAudioPlayer(),
      volume: 1,
      textChannelId: null,
      client: null,
      guildId: null,
      playing: false,
      current: null,
      handlersReady: false
    });
  }
  return guildQueues.get(guildId);
}

function clearQueue(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue) return;
  queue.tracks = [];
  queue.current = null;
  queue.playing = false;
}

function destroyGuildMusic(guildId) {
  const queue = guildQueues.get(guildId);
  if (queue) {
    queue.player.stop(true);
  }
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
  }
  guildQueues.delete(guildId);
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '??:??';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const INVALID_VIDEO_IDS = new Set(['undefined', 'null', '']);

/** @returns {string | null} */
function extractYoutubeVideoId(source) {
  if (!source) return null;

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return null;
    if (YT_VIDEO_ID_RE.test(trimmed)) return trimmed;
    const match = trimmed.match(YT_URL_ID_RE);
    return match?.[1] ?? null;
  }

  const id = source.video_id ?? source.videoId ?? source.id;
  if (typeof id === 'string' && YT_VIDEO_ID_RE.test(id.trim())) {
    return id.trim();
  }

  const candidate = source.url ?? source.link;
  if (typeof candidate === 'string' && candidate.trim()) {
    return extractYoutubeVideoId(candidate);
  }

  return null;
}

/** @returns {string | null} */
function youtubeWatchUrl(source) {
  const videoId = extractYoutubeVideoId(source);
  if (!videoId || INVALID_VIDEO_IDS.has(videoId)) {
    return null;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function isValidTrackUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com') && parsed.hostname !== 'youtu.be') {
      return false;
    }
    const videoId = extractYoutubeVideoId(url);
    return Boolean(videoId && !INVALID_VIDEO_IDS.has(videoId));
  } catch {
    return false;
  }
}

function isYoutubeVideoInput(query) {
  const trimmed = query.trim();
  if (YT_VIDEO_ID_RE.test(trimmed)) return true;
  return isValidTrackUrl(trimmed);
}

function trackFromVideoInfo(info) {
  const details = info.basic_info;
  const videoId = details.id ?? extractYoutubeVideoId(details.url_canonical);
  const trackUrl = youtubeWatchUrl(videoId);

  if (!trackUrl || !videoId) {
    throw new Error('Não consegui obter a URL de reprodução desta faixa.');
  }

  return {
    title: details.title ?? 'Sem título',
    url: trackUrl,
    videoId,
    videoInfo: info,
    duration: details.duration ?? 0,
    durationLabel: formatDuration(details.duration)
  };
}

async function searchFirstVideoId(query) {
  const yt = await getInnertube();
  const search = await yt.search(query, { type: 'video' });
  const hit = search.videos?.[0];
  const videoId = hit?.video_id ?? hit?.id;
  if (!videoId || INVALID_VIDEO_IDS.has(videoId)) {
    throw new Error(`Não achei nada para **${query}**.`);
  }
  return videoId;
}

async function createStreamForTrack(track) {
  console.log('[music] stream url:', track?.url);

  if (!track?.videoId && !isValidTrackUrl(track?.url)) {
    throw new Error(`URL inválida para stream: ${track?.url}`);
  }

  let info = track.videoInfo;
  if (!info) {
    const yt = await getInnertube();
    const videoId = track.videoId ?? extractYoutubeVideoId(track.url);
    info = await yt.getInfo(videoId);
    track.videoInfo = info;
  }

  const webStream = await info.download(DOWNLOAD_OPTIONS);
  const nodeStream = Readable.fromWeb(webStream);
  return { stream: nodeStream, type: 'arbitrary' };
}

function memberVoiceChannel(message) {
  return message.member?.voice?.channel ?? null;
}

function botCanJoin(channel) {
  const me = channel.guild.members.me;
  if (!me) return { ok: false, reason: 'Não consegui verificar as minhas permissões neste servidor.' };

  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect)) {
    return { ok: false, reason: 'Não tenho permissão para **conectar** neste canal de voz.' };
  }
  if (!perms.has(PermissionFlagsBits.Speak)) {
    return { ok: false, reason: 'Não tenho permissão para **falar** neste canal de voz.' };
  }
  return { ok: true };
}

function bindTextChannel(queue, message) {
  queue.textChannelId = message.channel.id;
  queue.client = message.client;
  queue.guildId = message.guild.id;
}

async function notifyQueueChannel(queue, content) {
  if (!queue.client || !queue.textChannelId || !queue.guildId) return;
  try {
    const guild = await queue.client.guilds.fetch(queue.guildId);
    const channel = await guild.channels.fetch(queue.textChannelId);
    if (channel?.isTextBased()) {
      await channel.send(content);
    }
  } catch {
    // ignore
  }
}

async function getOrCreateConnection(channel) {
  const existing = getVoiceConnection(channel.guild.id);
  if (existing) {
    patchVoiceConnection(existing);
    return existing;
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true
  });
  patchVoiceConnection(connection);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    connection.destroy();
    throw new Error('Timeout ao conectar no canal de voz. Tenta de novo em alguns segundos.');
  }

  return connection;
}

async function resolveTrack(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Me passa um link ou o nome da música, idiota.');
  }

  let videoId = null;

  if (isYoutubeVideoInput(trimmed)) {
    videoId = extractYoutubeVideoId(trimmed);
    if (!videoId) {
      throw new Error('Link ou ID do YouTube inválido.');
    }
  } else {
    videoId = await searchFirstVideoId(trimmed);
  }

  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);
  return trackFromVideoInfo(info);
}

function setupPlayerHandlers(guildId) {
  const queue = getQueue(guildId);
  if (queue.handlersReady) return;
  queue.handlersReady = true;

  queue.player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId).catch((err) => console.error('[music] playNext:', err));
  });

  queue.player.on('error', (err) => {
    console.error('[music] player error:', err);
    notifyQueueChannel(queue, '❌ Erro no player de áudio. Tentando a próxima faixa...').catch(() => {});
    playNext(guildId).catch((e) => console.error('[music] playNext:', e));
  });
}

async function playNext(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue || queue.tracks.length === 0) {
    if (queue) {
      queue.playing = false;
      queue.current = null;
    }
    return;
  }

  const track = queue.tracks.shift();
  queue.playing = true;
  queue.current = track;

  if (!track?.videoId && !isValidTrackUrl(track?.url)) {
    console.error('[music] track missing valid url:', track?.title, track?.url);
    await notifyQueueChannel(
      queue,
      `❌ **${track?.title ?? 'Faixa'}** sem URL válida. Pulando...`
    );
    return playNext(guildId);
  }

  let streamData;
  try {
    streamData = await createStreamForTrack(track);
  } catch (err) {
    console.error('[music] stream error:', err, 'url:', track?.url);
    const detail =
      err?.message?.includes('formato') ||
      err?.message?.includes('áudio') ||
      err?.message?.includes('reprodução')
        ? err.message
        : `${ERR_NO_AUDIO_FORMAT}`;
    await notifyQueueChannel(
      queue,
      `❌ Erro ao tocar **${track.title}**: ${detail} Pulando...`
    );
    return playNext(guildId);
  }

  const resource = createAudioResource(streamData.stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true
  });

  if (resource.volume) {
    resource.volume.setVolumeLogarithmic(queue.volume);
  }

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    queue.playing = false;
    queue.current = null;
    return;
  }

  connection.subscribe(queue.player);
  queue.player.play(resource);

  await notifyQueueChannel(
    queue,
    `▶️ Tocando: **${track.title}** \`[${track.durationLabel}]\``
  );
}

async function handlePlay(message, query) {
  const voiceChannel = memberVoiceChannel(message);
  if (!voiceChannel) {
    await message.reply('Entra em um canal de voz antes de pedir música, idiota.');
    return true;
  }

  const perm = botCanJoin(voiceChannel);
  if (!perm.ok) {
    await message.reply(`❌ ${perm.reason}`);
    return true;
  }

  let track;
  try {
    track = await resolveTrack(query);
  } catch (err) {
    await message.reply(`❌ ${err.message}`);
    return true;
  }

  const queue = getQueue(message.guild.id);
  bindTextChannel(queue, message);
  setupPlayerHandlers(message.guild.id);

  track.requestedBy = message.author.tag;
  queue.tracks.push(track);

  try {
    await getOrCreateConnection(voiceChannel);
  } catch (err) {
    queue.tracks.pop();
    await message.reply(`❌ ${err.message}`);
    return true;
  }

  const wasPlaying =
    queue.playing ||
    queue.player.state.status === AudioPlayerStatus.Playing ||
    queue.player.state.status === AudioPlayerStatus.Paused;

  if (!wasPlaying) {
    await playNext(message.guild.id);
  } else {
    await message.reply(`🎵 Adicionado à fila (#${queue.tracks.length}): **${track.title}**`);
  }

  return true;
}

async function handleSkip(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue?.current && (!queue || queue.tracks.length === 0)) {
    await message.reply('Não tem nada tocando pra pular.');
    return true;
  }
  queue.player.stop(true);
  await message.reply('⏭️ Pulado!');
  return true;
}

async function handleStop(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue?.current && (!queue || queue.tracks.length === 0)) {
    await message.reply('Não tem música tocando.');
    return true;
  }
  clearQueue(message.guild.id);
  queue.player.stop(true);
  destroyGuildMusic(message.guild.id);
  await message.reply('⏹️ Parei tudo e saí do canal.');
  return true;
}

async function handleQueue(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue?.current && (!queue || queue.tracks.length === 0)) {
    await message.reply('A fila está vazia.');
    return true;
  }

  const lines = [];
  if (queue.current) {
    lines.push(`**Tocando agora:** ${queue.current.title} \`[${queue.current.durationLabel}]\``);
  }
  if (queue.tracks.length > 0) {
    const preview = queue.tracks
      .slice(0, 10)
      .map((t, i) => `${i + 1}. ${t.title} \`[${t.durationLabel}]\``)
      .join('\n');
    lines.push(`**Na fila (${queue.tracks.length}):**\n${preview}`);
    if (queue.tracks.length > 10) {
      lines.push(`... e mais ${queue.tracks.length - 10}`);
    }
  }

  await message.reply(lines.join('\n\n'));
  return true;
}

async function handlePause(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue || queue.player.state.status !== AudioPlayerStatus.Playing) {
    await message.reply('Nada está tocando agora.');
    return true;
  }
  queue.player.pause();
  await message.reply('⏸️ Pausado.');
  return true;
}

async function handleResume(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue || queue.player.state.status !== AudioPlayerStatus.Paused) {
    await message.reply('Nada está pausado.');
    return true;
  }
  queue.player.unpause();
  await message.reply('▶️ Continuando.');
  return true;
}

async function handleNowPlaying(message) {
  const queue = guildQueues.get(message.guild.id);
  if (!queue?.current) {
    await message.reply('Nada está tocando agora.');
    return true;
  }
  const vol = Math.round(queue.volume * 100);
  await message.reply(
    `🎶 **${queue.current.title}**\n` +
      `Duração: \`${queue.current.durationLabel}\` | Volume: \`${vol}%\`\n` +
      `${queue.current.url}`
  );
  return true;
}

async function handleVolume(message, args) {
  const queue = getQueue(message.guild.id);
  const raw = args[0];

  if (!raw) {
    await message.reply(`Volume atual: **${Math.round(queue.volume * 100)}%** (use \`!volume 1-100\`)`);
    return true;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 1 || value > 100) {
    await message.reply('Volume inválido. Usa um número de **1** a **100**.');
    return true;
  }

  queue.volume = value / 100;
  const resource = queue.player.state.resource;
  if (resource?.volume) {
    resource.volume.setVolumeLogarithmic(queue.volume);
  }

  await message.reply(`🔊 Volume definido para **${value}%**.`);
  return true;
}

function extractAfterPrefix(content, prefix) {
  return content.slice(prefix.length).trim();
}

async function handleMusicCommand(message) {
  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!MUSIC_COMMANDS.some((cmd) => lower === cmd || lower.startsWith(`${cmd} `))) {
    return false;
  }

  if (lower.startsWith('!play')) {
    const query = extractAfterPrefix(content, content.slice(0, 5));
    if (!query) {
      await message.reply('Uso: `!play nome ou link da música`');
      return true;
    }
    return handlePlay(message, query);
  }

  if (lower.startsWith('!pause')) return handlePause(message);
  if (lower.startsWith('!skip')) return handleSkip(message);
  if (lower.startsWith('!stop')) return handleStop(message);
  if (lower.startsWith('!queue') || lower.startsWith('!fila')) return handleQueue(message);
  if (lower.startsWith('!resume') || lower.startsWith('!continuar')) return handleResume(message);
  if (lower.startsWith('!np') || lower.startsWith('!tocando')) return handleNowPlaying(message);
  if (lower.startsWith('!volume')) {
    const args = content.split(/\s+/).slice(1);
    return handleVolume(message, args);
  }

  if (lower === '!p' || lower.startsWith('!p ')) {
    const query = extractAfterPrefix(content, '!p');
    if (!query) {
      await message.reply('Uso: `!p nome ou link da música`');
      return true;
    }
    return handlePlay(message, query);
  }

  return false;
}

module.exports = {
  handleMusicCommand,
  resolveTrack,
  youtubeWatchUrl,
  isValidTrackUrl,
  extractYoutubeVideoId,
  createStreamForTrack
};
