const { PermissionFlagsBits } = require("discord.js");

const MUSIC_COMMANDS = [
  "!play",
  "!p",
  "!skip",
  "!stop",
  "!queue",
  "!fila",
  "!pause",
  "!resume",
  "!continuar",
  "!np",
  "!tocando",
  "!volume"
];

const LAVALINK_HOST = process.env.LAVALINK_HOST || "127.0.0.1";
const LAVALINK_PORT = Number.parseInt(process.env.LAVALINK_PORT || "2333", 10);
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || "youshallnotpass";
const LAVALINK_SECURE = process.env.LAVALINK_SECURE === "true";
const LAVALINK_SEARCH_SOURCE = process.env.LAVALINK_SEARCH_SOURCE || "ytmsearch";
const DEFAULT_VOLUME = Number.parseInt(process.env.LAVALINK_DEFAULT_VOLUME || "80", 10);

let lavalinkImportPromise;
let discordClient;

function getLavalinkModule() {
  if (!lavalinkImportPromise) {
    lavalinkImportPromise = import("lavalink-client");
  }
  return lavalinkImportPromise;
}

async function initLavalink(client) {
  discordClient = client;
  if (client.lavalink) return client.lavalink;

  const { LavalinkManager } = await getLavalinkModule();
  const manager = new LavalinkManager({
    nodes: [
      {
        id: "main",
        host: LAVALINK_HOST,
        port: LAVALINK_PORT,
        authorization: LAVALINK_PASSWORD,
        secure: LAVALINK_SECURE
      }
    ],
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
    },
    autoSkip: true,
    client: {
      id: client.user.id,
      username: client.user.username
    },
    playerOptions: {
      defaultSearchPlatform: LAVALINK_SEARCH_SOURCE,
      onEmptyQueue: {
        destroyAfterMs: 60_000
      }
    }
  });

  manager.nodeManager.on("connect", (node) => {
    console.log(`[lavalink] conectado ao node ${node.id}`);
  });

  manager.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`[lavalink] node ${node.id} desconectou:`, reason?.reason ?? reason);
  });

  manager.nodeManager.on("error", (node, error) => {
    console.error(`[lavalink] erro no node ${node.id}:`, error);
  });

  manager.on("trackStart", async (player, track) => {
    await sendPlayerMessage(player, `▶️ Tocando: **${trackTitle(track)}** \`[${trackDuration(track)}]\``);
  });

  manager.on("trackError", async (player, track, payload) => {
    console.error("[lavalink] trackError:", payload);
    await sendPlayerMessage(player, `❌ Erro ao tocar **${trackTitle(track)}**. Pulando...`);
  });

  manager.on("trackStuck", async (player, track) => {
    await sendPlayerMessage(player, `❌ **${trackTitle(track)}** travou. Pulando...`);
  });

  manager.on("queueEnd", async (player) => {
    await sendPlayerMessage(player, "✅ Fila acabou. Vou sair do canal em instantes.");
  });

  await manager.init({ id: client.user.id, username: client.user.username });
  client.lavalink = manager;
  console.log(`[lavalink] usando ${LAVALINK_HOST}:${LAVALINK_PORT}`);
  return manager;
}

function handleLavalinkRawData(client, packet) {
  client.lavalink?.sendRawData(packet);
}

function memberVoiceChannel(message) {
  return message.member?.voice?.channel ?? null;
}

function botCanJoin(channel) {
  const me = channel.guild.members.me;
  if (!me) return { ok: false, reason: "Não consegui verificar as minhas permissões neste servidor." };

  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect)) {
    return { ok: false, reason: "Não tenho permissão para **conectar** neste canal de voz." };
  }
  if (!perms.has(PermissionFlagsBits.Speak)) {
    return { ok: false, reason: "Não tenho permissão para **falar** neste canal de voz." };
  }
  return { ok: true };
}

function getManager(message) {
  return message.client.lavalink ?? null;
}

function getPlayer(message) {
  const manager = getManager(message);
  return manager?.getPlayer(message.guild.id) ?? manager?.players?.get(message.guild.id) ?? null;
}

function extractAfterPrefix(content, prefix) {
  return content.slice(prefix.length).trim();
}

function isUrl(query) {
  try {
    const parsed = new URL(query);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "??:??";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trackTitle(track) {
  return track?.info?.title ?? track?.title ?? "Sem título";
}

function trackUri(track) {
  return track?.info?.uri ?? track?.uri ?? "";
}

function trackDuration(track) {
  if (track?.info?.isStream) return "ao vivo";
  return formatDurationMs(track?.info?.duration ?? track?.duration);
}

function queuedTracks(player) {
  const tracks = player?.queue?.tracks;
  if (!tracks) return [];
  if (Array.isArray(tracks)) return tracks;
  if (typeof tracks.toArray === "function") return tracks.toArray();
  if (typeof tracks.values === "function") return Array.from(tracks.values());
  return [];
}

async function sendPlayerMessage(player, content) {
  const channelId = player?.textChannelId;
  if (!channelId || !discordClient?.channels) return;

  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(content).catch(() => null);
  }
}

async function handlePlay(message, query) {
  const voiceChannel = memberVoiceChannel(message);
  if (!voiceChannel) {
    await message.reply("Entra em um canal de voz antes de pedir música, idiota.");
    return true;
  }

  const perm = botCanJoin(voiceChannel);
  if (!perm.ok) {
    await message.reply(`❌ ${perm.reason}`);
    return true;
  }

  const manager = getManager(message);
  if (!manager) {
    await message.reply("❌ Lavalink ainda não iniciou. Confere se o bot terminou de ficar online.");
    return true;
  }

  let player = getPlayer(message);
  if (player?.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
    await message.reply("❌ Já estou tocando em outro canal de voz neste servidor.");
    return true;
  }

  try {
    player = await manager.createPlayer({
      guildId: message.guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: message.channel.id,
      selfDeaf: true,
      volume: Number.isFinite(DEFAULT_VOLUME) ? DEFAULT_VOLUME : 80
    });

    await player.connect();
  } catch (err) {
    console.error("[lavalink] connect error:", err);
    await message.reply("❌ Não consegui conectar ao canal de voz pelo Lavalink.");
    return true;
  }

  let result;
  try {
    const search = isUrl(query)
      ? { query }
      : { query, source: LAVALINK_SEARCH_SOURCE };
    result = await player.search(search, message.author);
  } catch (err) {
    console.error("[lavalink] search error:", err);
    await message.reply("❌ Não consegui buscar essa música no Lavalink.");
    return true;
  }

  const tracks = result?.tracks ?? [];
  if (tracks.length === 0) {
    await message.reply(`❌ Não achei nada para **${query}**.`);
    return true;
  }

  const loadType = String(result.loadType ?? "").toLowerCase();
  const isPlaylist = loadType.includes("playlist") || Boolean(result.playlist);
  const tracksToAdd = isPlaylist ? tracks : tracks[0];
  await player.queue.add(tracksToAdd);

  const wasPlaying = player.playing || player.paused;
  if (!wasPlaying) {
    await player.play();
    return true;
  }

  if (isPlaylist) {
    const playlistName = result.playlist?.name ?? result.playlist?.title ?? "playlist";
    await message.reply(`🎵 Adicionei **${tracks.length}** faixas de **${playlistName}** à fila.`);
  } else {
    await message.reply(`🎵 Adicionado à fila (#${queuedTracks(player).length}): **${trackTitle(tracks[0])}**`);
  }

  return true;
}

async function handleSkip(message) {
  const player = getPlayer(message);
  if (!player?.queue?.current) {
    await message.reply("Não tem nada tocando pra pular.");
    return true;
  }

  await player.skip();
  await message.reply("⏭️ Pulado!");
  return true;
}

async function handleStop(message) {
  const player = getPlayer(message);
  if (!player) {
    await message.reply("Não tem música tocando.");
    return true;
  }

  await player.destroy();
  await message.reply("⏹️ Parei tudo e saí do canal.");
  return true;
}

async function handleQueue(message) {
  const player = getPlayer(message);
  const current = player?.queue?.current;
  const tracks = queuedTracks(player);

  if (!current && tracks.length === 0) {
    await message.reply("A fila está vazia.");
    return true;
  }

  const lines = [];
  if (current) {
    lines.push(`**Tocando agora:** ${trackTitle(current)} \`[${trackDuration(current)}]\``);
  }

  if (tracks.length > 0) {
    const preview = tracks
      .slice(0, 10)
      .map((track, index) => `${index + 1}. ${trackTitle(track)} \`[${trackDuration(track)}]\``)
      .join("\n");
    lines.push(`**Na fila (${tracks.length}):**\n${preview}`);
    if (tracks.length > 10) {
      lines.push(`... e mais ${tracks.length - 10}`);
    }
  }

  await message.reply(lines.join("\n\n"));
  return true;
}

async function handlePause(message) {
  const player = getPlayer(message);
  if (!player?.playing) {
    await message.reply("Nada está tocando agora.");
    return true;
  }

  await player.pause();
  await message.reply("⏸️ Pausado.");
  return true;
}

async function handleResume(message) {
  const player = getPlayer(message);
  if (!player?.paused) {
    await message.reply("Nada está pausado.");
    return true;
  }

  await player.resume();
  await message.reply("▶️ Continuando.");
  return true;
}

async function handleNowPlaying(message) {
  const player = getPlayer(message);
  const current = player?.queue?.current;
  if (!current) {
    await message.reply("Nada está tocando agora.");
    return true;
  }

  const volume = Math.round(player.volume ?? DEFAULT_VOLUME);
  const position = formatDurationMs(player.position ?? player.lastPosition ?? 0);
  await message.reply(
    `🎶 **${trackTitle(current)}**\n` +
      `Tempo: \`${position}/${trackDuration(current)}\` | Volume: \`${volume}%\`\n` +
      `${trackUri(current)}`
  );
  return true;
}

async function handleVolume(message, args) {
  const player = getPlayer(message);
  const raw = args[0];

  if (!raw) {
    const volume = Math.round(player?.volume ?? DEFAULT_VOLUME);
    await message.reply(`Volume atual: **${volume}%** (use \`!volume 1-100\`)`);
    return true;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 1 || value > 100) {
    await message.reply("Volume inválido. Usa um número de **1** a **100**.");
    return true;
  }

  if (!player) {
    await message.reply("Não tem música tocando para ajustar o volume.");
    return true;
  }

  await player.setVolume(value);
  await message.reply(`🔊 Volume definido para **${value}%**.`);
  return true;
}

async function handleMusicCommand(message) {
  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!MUSIC_COMMANDS.some((cmd) => lower === cmd || lower.startsWith(`${cmd} `))) {
    return false;
  }

  if (lower.startsWith("!play")) {
    const query = extractAfterPrefix(content, content.slice(0, 5));
    if (!query) {
      await message.reply("Uso: `!play nome ou link da música`");
      return true;
    }
    return handlePlay(message, query);
  }

  if (lower.startsWith("!pause")) return handlePause(message);
  if (lower.startsWith("!skip")) return handleSkip(message);
  if (lower.startsWith("!stop")) return handleStop(message);
  if (lower.startsWith("!queue") || lower.startsWith("!fila")) return handleQueue(message);
  if (lower.startsWith("!resume") || lower.startsWith("!continuar")) return handleResume(message);
  if (lower.startsWith("!np") || lower.startsWith("!tocando")) return handleNowPlaying(message);
  if (lower.startsWith("!volume")) {
    const args = content.split(/\s+/).slice(1);
    return handleVolume(message, args);
  }

  if (lower === "!p" || lower.startsWith("!p ")) {
    const query = extractAfterPrefix(content, "!p");
    if (!query) {
      await message.reply("Uso: `!p nome ou link da música`");
      return true;
    }
    return handlePlay(message, query);
  }

  return false;
}

module.exports = {
  handleMusicCommand,
  initLavalink,
  handleLavalinkRawData
};
