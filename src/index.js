const { Client, Events, GatewayIntentBits, PermissionsBitField } = require('discord.js');
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
const { loadData } = require('./systems/database');
const { handleMarriageCommand } = require('./systems/marriage');
const { handlePointsCommand } = require('./systems/points');
const { addXpFromMessage, handleXpCommand } = require('./systems/xp');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const goodbyeChannelId = process.env.GOODBYE_CHANNEL_ID;
const data = loadData();

if (!token) {
  console.error('Erro: coloque o token do bot no arquivo .env como DISCORD_TOKEN=seu_token');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const musicQueues = new Map();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot online como ${readyClient.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const channel = await getTextChannel(member.guild, welcomeChannelId);
  if (!channel) return;

  await channel.send(`Bem-vindo(a), ${member}! Aproveite o servidor.`);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const channel = await getTextChannel(member.guild, goodbyeChannelId);
  if (!channel) return;

  await channel.send(`${member.user.tag} saiu do servidor.`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  addXpFromMessage(message, data);

  if (message.content === '!ping') {
    await message.reply('Pong!');
    return;
  }

  if (handleMarriageCommand(message, data)) return;
  if (handlePointsCommand(message, data)) return;
  if (handleXpCommand(message, data)) return;

  if (message.content.startsWith('!play ')) {
    await playMusic(message);
    return;
  }

  if (message.content === '!skip') {
    skipMusic(message);
    return;
  }

  if (message.content === '!stop') {
    stopMusic(message);
    return;
  }

  if (message.content === '!queue') {
    showQueue(message);
  }
});

client.login(token);

async function getTextChannel(guild, channelId) {
  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased() ? channel : null;
  }

  return guild.systemChannel?.isTextBased() ? guild.systemChannel : null;
}

async function playMusic(message) {
  const url = message.content.slice('!play '.length).trim();
  const voiceChannel = message.member?.voice.channel;

  if (!voiceChannel) {
    await message.reply('Entre em um canal de voz primeiro.');
    return;
  }

  const botMember = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;

  if (!permissions?.has(PermissionsBitField.Flags.Connect)) {
    await message.reply('Nao tenho permissao para conectar nesse canal de voz. Ative a permissao Conectar para o bot.');
    return;
  }

  if (!permissions.has(PermissionsBitField.Flags.Speak)) {
    await message.reply('Nao tenho permissao para falar nesse canal de voz. Ative a permissao Falar para o bot.');
    return;
  }

  if (voiceChannel.full) {
    await message.reply('Esse canal de voz esta cheio.');
    return;
  }

  if (!play.yt_validate(url)) {
    await message.reply('Envie um link valido do YouTube.');
    return;
  }

  const videoInfo = await play.video_info(url).catch(() => null);
  if (!videoInfo) {
    await message.reply('Nao consegui ler esse video.');
    return;
  }

  const queue = getOrCreateQueue(message.guild.id, message.channel);
  queue.songs.push({
    title: videoInfo.video_details.title,
    url
  });

  await message.reply(`Adicionado na fila: **${videoInfo.video_details.title}**`);

  if (!queue.playing) {
    await startQueue(message, voiceChannel, queue);
  }
}

function getOrCreateQueue(guildId, textChannel) {
  let queue = musicQueues.get(guildId);

  if (!queue) {
    queue = {
      player: createAudioPlayer(),
      songs: [],
      playing: false,
      textChannel
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
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    console.error('Erro ao entrar no canal de voz:', error);
    connection.destroy();
    queue.playing = false;
    await message.reply('Nao consegui entrar no canal de voz. Confira as permissoes do bot e veja o erro no terminal.');
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
    queue.playing = false;
    getVoiceConnection(guildId)?.destroy();
    musicQueues.delete(guildId);
    return;
  }

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
    inputType: stream.type
  });

  queue.player.play(resource);
  await queue.textChannel.send(`Tocando agora: **${song.title}**`);
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
  queue.player.stop();
  getVoiceConnection(message.guild.id)?.destroy();
  musicQueues.delete(message.guild.id);
  message.reply('Musica parada e fila limpa.');
}

function showQueue(message) {
  const queue = musicQueues.get(message.guild.id);

  if (!queue || queue.songs.length === 0) {
    message.reply('A fila esta vazia.');
    return;
  }

  const songs = queue.songs
    .slice(0, 10)
    .map((song, index) => `${index + 1}. ${song.title}`)
    .join('\n');

  message.reply(`Fila:\n${songs}`);
}
