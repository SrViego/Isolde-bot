const { PermissionsBitField } = require('discord.js');
const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const play = require('play-dl');

const musicQueues = new Map();

async function handleMusicCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '!play' || command === '!p') {
    await addSong(message, args.slice(1).join(' '));
    return true;
  }

  if (command === '!skip') {
    skipMusic(message);
    return true;
  }

  if (command === '!stop') {
    stopMusic(message);
    return true;
  }

  if (command === '!queue' || command === '!fila') {
    showQueue(message);
    return true;
  }

  if (command === '!pause') {
    pauseMusic(message);
    return true;
  }

  if (command === '!resume' || command === '!continuar') {
    resumeMusic(message);
    return true;
  }

  if (command === '!np' || command === '!tocando') {
    showNowPlaying(message);
    return true;
  }

  if (command === '!volume') {
    setVolume(message, args[1]);
    return true;
  }

  return false;
}

async function addSong(message, query) {
  const voiceChannel = message.member?.voice.channel;

  if (!query) {
    await message.reply('Use: !play link_ou_nome_da_musica');
    return;
  }

  if (!voiceChannel) {
    await message.reply('Entre em um canal de voz primeiro.');
    return;
  }

  const permissionError = await getVoicePermissionError(message, voiceChannel);
  if (permissionError) {
    await message.reply(permissionError);
    return;
  }

  const song = await resolveSong(query);
  if (!song) {
    await message.reply('Nao encontrei essa musica no YouTube.');
    return;
  }

  const queue = getOrCreateQueue(message.guild.id, message.channel);
  queue.songs.push(song);

  await message.reply(`Adicionado na fila: **${song.title}**`);

  if (!queue.playing) {
    await startQueue(message, voiceChannel, queue);
  }
}

async function resolveSong(query) {
  const validation = play.yt_validate(query);

  if (validation === 'video') {
    const videoInfo = await play.video_info(query).catch(() => null);
    if (!videoInfo) return null;

    return {
      title: videoInfo.video_details.title,
      url: videoInfo.video_details.url,
      duration: videoInfo.video_details.durationRaw || 'ao vivo'
    };
  }

  if (validation === 'playlist') {
    const playlist = await play.playlist_info(query, { incomplete: true }).catch(() => null);
    const videos = playlist ? await playlist.all_videos() : [];
    const firstVideo = videos[0];

    if (!firstVideo) return null;

    return {
      title: firstVideo.title,
      url: firstVideo.url,
      duration: firstVideo.durationRaw || 'ao vivo'
    };
  }

  const results = await play.search(query, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
  const firstResult = results[0];

  if (!firstResult) return null;

  return {
    title: firstResult.title,
    url: firstResult.url,
    duration: firstResult.durationRaw || 'ao vivo'
  };
}

async function getVoicePermissionError(message, voiceChannel) {
  const botMember = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;

  if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
    return 'Nao tenho permissao para ver esse canal de voz.';
  }

  if (!permissions.has(PermissionsBitField.Flags.Connect)) {
    return 'Nao tenho permissao para conectar nesse canal de voz.';
  }

  if (!permissions.has(PermissionsBitField.Flags.Speak)) {
    return 'Nao tenho permissao para falar nesse canal de voz.';
  }

  if (voiceChannel.full) {
    return 'Esse canal de voz esta cheio.';
  }

  return null;
}

function getOrCreateQueue(guildId, textChannel) {
  let queue = musicQueues.get(guildId);

  if (!queue) {
    queue = {
      player: createAudioPlayer(),
      songs: [],
      current: null,
      playing: false,
      textChannel,
      volume: 50
    };

    queue.player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId);
    });

    queue.player.on('error', (error) => {
      console.error('Erro no player de musica:', error);
      playNext(guildId);
    });

    musicQueues.set(guildId, queue);
  }

  queue.textChannel = textChannel;
  return queue;
}

async function startQueue(message, voiceChannel, queue) {
  const oldConnection = getVoiceConnection(message.guild.id);
  if (oldConnection) oldConnection.destroy();

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    console.error('Erro ao entrar no canal de voz:', error);
    connection.destroy();
    queue.playing = false;
    await message.reply('Nao consegui entrar no canal de voz. Confira minhas permissoes e veja o terminal.');
    return;
  }

  connection.subscribe(queue.player);
  playNext(message.guild.id);
}

async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  const song = queue.songs.shift();

  if (!song) {
    queue.current = null;
    queue.playing = false;
    getVoiceConnection(guildId)?.destroy();
    musicQueues.delete(guildId);
    return;
  }

  queue.current = song;
  queue.playing = true;

  const stream = await play.stream(song.url).catch((error) => {
    console.error('Erro ao abrir stream do YouTube:', error);
    return null;
  });

  if (!stream) {
    queue.textChannel.send(`Nao consegui tocar: **${song.title}**`);
    playNext(guildId);
    return;
  }

  const resource = createAudioResource(stream.stream, {
    inputType: stream.type,
    inlineVolume: true
  });

  resource.volume.setVolume(queue.volume / 100);
  queue.player.play(resource);
  await queue.textChannel.send(`Tocando agora: **${song.title}** (${song.duration})`);
}

function skipMusic(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue || !queue.playing) {
    message.reply('Nao tem musica tocando agora.');
    return;
  }

  queue.player.stop();
  message.reply('Pulando musica.');
}

function stopMusic(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue) {
    message.reply('Nao tem musica tocando agora.');
    return;
  }

  queue.songs = [];
  queue.current = null;
  queue.player.stop();
  getVoiceConnection(message.guild.id)?.destroy();
  musicQueues.delete(message.guild.id);
  message.reply('Musica parada e fila limpa.');
}

function showQueue(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue || (!queue.current && queue.songs.length === 0)) {
    message.reply('A fila esta vazia.');
    return;
  }

  const current = queue.current ? `Tocando: **${queue.current.title}**` : 'Nada tocando agora.';
  const nextSongs = queue.songs
    .slice(0, 10)
    .map((song, index) => `${index + 1}. ${song.title} (${song.duration})`);

  message.reply(`${current}\n\nFila:\n${nextSongs.length ? nextSongs.join('\n') : 'Sem proximas musicas.'}`);
}
function pauseMusic(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue || !queue.playing) {
    message.reply('Nao tem musica tocando agora.');
    return;
  }

  queue.player.pause();
  message.reply('Musica pausada.');
}

function resumeMusic(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue || !queue.playing) {
    message.reply('Nao tem musica pausada para continuar.');
    return;
  }

  queue.player.unpause();
  message.reply('Musica retomada.');
}

function showNowPlaying(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue?.current) {
    message.reply('Nao tem musica tocando agora.');
    return;
  }

  message.reply(`Tocando agora: **${queue.current.title}** (${queue.current.duration})`);
}

function setVolume(message, value) {
  const queue = musicQueues.get(message.guild.id);
  const volume = Number(value);

  if (!queue) {
    message.reply('Nao tem musica tocando agora.');
    return;
  }

  if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
    message.reply('Use: !volume numero_de_1_a_100');
    return;
  }

  queue.volume = volume;
  const resource = queue.player.state.resource;
  if (resource?.volume) resource.volume.setVolume(volume / 100);

  message.reply(`Volume definido para ${volume}%.`);
}

module.exports = {
  handleMusicCommand
};
