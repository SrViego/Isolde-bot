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

function createSong(video) {
  return {
    title: video.title,
    url: video.url,
    duration: video.durationRaw || 'ao vivo'
  };
}

async function resolveSongs(query) {
  if (!query) return [];

  const validation = play.yt_validate(query);

  try {
    if (validation === 'video') {
      const videoInfo = await play.video_info(query);
      return [createSong(videoInfo.video_details)];
    }

    if (validation === 'playlist') {
      const playlist = await play.playlist_info(query, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos.map(createSong);
    }

    const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
    if (results[0]) return [createSong(results[0])];
  } catch (error) {
    console.error('Erro ao resolver música:', error);
  }

  return [];
}

async function addSong(message, query) {
  const voiceChannel = message.member?.voice.channel;

  if (!query) {
    return message.reply('Use: `!play <link ou nome da música>`');
  }

  if (!voiceChannel) {
    return message.reply('Você precisa estar em um canal de voz primeiro!');
  }

  const permissionError = await getVoicePermissionError(message, voiceChannel);
  if (permissionError) {
    return message.reply(permissionError);
  }

  const songs = await resolveSongs(query);

  if (songs.length === 0) {
    return message.reply('Não consegui encontrar essa música no YouTube.');
  }

  const queue = getOrCreateQueue(message.guild.id, message.channel);

  queue.songs.push(...songs);

  if (songs.length === 1) {
    await message.reply(`✅ **${songs[0].title}** adicionado à fila!`);
  } else {
    await message.reply(`✅ Playlist com **${songs.length}** músicas adicionada à fila!`);
  }

  if (!queue.playing && !queue.current) {
    await startPlaying(message.guild.id, voiceChannel, queue);
  }
}

async function getVoicePermissionError(message, voiceChannel) {
  const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  if (!botMember) return 'Não consegui verificar minhas permissões.';

  const permissions = voiceChannel.permissionsFor(botMember);

  console.log(`🔍 DEBUG PERMISSÕES - Canal: ${voiceChannel.name}`);
  console.log(`   Bot tem ADMINISTRADOR? → ${permissions.has(PermissionsBitField.Flags.Administrator)}`);
  console.log(`   Pode Ver Canal?      → ${permissions.has(PermissionsBitField.Flags.ViewChannel)}`);
  console.log(`   Pode Conectar?       → ${permissions.has(PermissionsBitField.Flags.Connect)}`);
  console.log(`   Pode Falar?          → ${permissions.has(PermissionsBitField.Flags.Speak)}`);
  console.log(`   Cargo mais alto do bot: ${botMember.roles.highest.name} (posição ${botMember.roles.highest.position})`);

  if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
    return 'Não tenho permissão para **ver** esse canal de voz.';
  }
  if (!permissions.has(PermissionsBitField.Flags.Connect)) {
    return 'Não tenho permissão para **conectar** nesse canal de voz.';
  }
  if (!permissions.has(PermissionsBitField.Flags.Speak)) {
    return 'Não tenho permissão para **falar** nesse canal de voz.';
  }
  if (voiceChannel.full) {
    return 'O canal de voz está cheio!';
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
      volume: 70,
      connection: null
    };

    queue.player.on(AudioPlayerStatus.Idle, () => playNext(guildId));
    queue.player.on('error', (error) => {
      console.error('Erro no player:', error);
      playNext(guildId);
    });

    musicQueues.set(guildId, queue);
  }

  queue.textChannel = textChannel;
  return queue;
}

async function startPlaying(guildId, voiceChannel, queue) {
  let connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    await new Promise(r => setTimeout(r, 800));
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`🔄 Tentativa ${attempts}/${maxAttempts} de entrar no canal ${voiceChannel.name}`);

    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    queue.connection = connection;

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 60_000);
      console.log(`✅ SUCESSO! Conectado no canal ${voiceChannel.name}`);
      break;
    } catch (error) {
      console.error(`❌ Tentativa ${attempts} falhou →`, error);
      connection.destroy();

      if (attempts >= maxAttempts) {
        queue.playing = false;
        await queue.textChannel.send('❌ **Não consegui entrar no canal depois de 3 tentativas.**\n\nMe manda o console completo do VSCode agora!');
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  connection.subscribe(queue.player);
  playNext(guildId);
}

async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  const song = queue.songs.shift();

  if (!song) {
    queue.current = null;
    queue.playing = false;
    const connection = getVoiceConnection(guildId);
    if (connection) connection.destroy();
    musicQueues.delete(guildId);
    await queue.textChannel.send('🎵 Fila finalizada.');
    return;
  }

  queue.current = song;
  queue.playing = true;

  try {
    const stream = await play.stream(song.url, { quality: 2 });

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });

    resource.volume?.setVolume(queue.volume / 100);

    queue.player.play(resource);

    await queue.textChannel.send(`▶️ **Tocando agora:** ${song.title} (${song.duration})`);
  } catch (error) {
    console.error(`Erro ao tocar ${song.title}:`, error);
    await queue.textChannel.send(`❌ Erro ao tocar: **${song.title}** (pulando...)`);
    playNext(guildId);
  }
}

function skipMusic(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue?.playing) return message.reply('Nenhuma música tocando no momento.');

  queue.player.stop();
  message.reply('⏭️ Música pulada.');
}

function stopMusic(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue) return message.reply('Nada tocando no momento.');

  queue.songs = [];
  queue.player.stop();
  getVoiceConnection(message.guild.id)?.destroy();
  musicQueues.delete(message.guild.id);
  message.reply('⏹️ Música parada e fila limpa.');
}

function showQueue(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue || (!queue.current && queue.songs.length === 0)) {
    return message.reply('A fila está vazia.');
  }

  let response = queue.current 
    ? `▶️ **Tocando:** ${queue.current.title}\n\n` 
    : 'Nada tocando no momento.\n\n';

  if (queue.songs.length > 0) {
    const next = queue.songs.slice(0, 10).map((song, i) => 
      `${i+1}. ${song.title} (${song.duration})`
    ).join('\n');
    response += `**Próximas músicas:**\n${next}`;
    if (queue.songs.length > 10) response += `\n... e mais ${queue.songs.length - 10} músicas`;
  }

  message.reply(response);
}

function pauseMusic(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue?.playing) return message.reply('Nada tocando.');

  queue.player.pause();
  message.reply('⏸️ Música pausada.');
}

function resumeMusic(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue?.playing) return message.reply('Não há música pausada.');

  queue.player.unpause();
  message.reply('▶️ Música retomada.');
}

function showNowPlaying(message) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue?.current) return message.reply('Nada tocando no momento.');

  message.reply(`▶️ **Tocando agora:** ${queue.current.title} (${queue.current.duration})`);
}

function setVolume(message, value) {
  const queue = musicQueues.get(message.guild.id);
  if (!queue) return message.reply('Nada tocando no momento.');

  const volume = parseInt(value);
  if (isNaN(volume) || volume < 1 || volume > 100) {
    return message.reply('Use: `!volume 1-100`');
  }

  queue.volume = volume;
  const resource = queue.player.state?.resource;
  if (resource?.volume) resource.volume.setVolume(volume / 100);

  message.reply(`🔊 Volume definido para **${volume}%**`);
}

module.exports = { handleMusicCommand };