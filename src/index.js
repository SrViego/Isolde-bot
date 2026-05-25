require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
const { loadData } = require("./systems/database");
const { handleMarriageCommand } = require("./systems/marriage");
const { handlePointsCommand } = require("./systems/points");
const { handleShopCommand } = require("./systems/shop");
const { addXpFromMessage, handleXpCommand } = require("./systems/xp");
const { handleModerationCommand } = require("./systems/moderation");
const { handleLavalinkRawData, handleMusicCommand, initLavalink } = require("./systems/music");

const token = process.env.DISCORD_TOKEN;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const goodbyeChannelId = process.env.GOODBYE_CHANNEL_ID;
const data = loadData();

if (!token) {
  console.error("Erro: coloque o token do bot no arquivo .env como DISCORD_TOKEN=seu_token");
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

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online como ${readyClient.user.tag}`);
  await initLavalink(readyClient);
});

client.on("raw", (packet) => {
  handleLavalinkRawData(client, packet);
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

  if (message.content === "!ping") {
    await message.reply("Pong!");
    return;
  }

  if (await handleModerationCommand(message, data)) return;
  if (handleMarriageCommand(message, data)) return;
  if (handlePointsCommand(message, data)) return;
  if (handleShopCommand(message, data)) return;
  if (handleXpCommand(message, data)) return;
  if (await handleMusicCommand(message)) return;
});

async function getTextChannel(guild, channelId) {
  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased() ? channel : null;
  }

  return guild.systemChannel?.isTextBased() ? guild.systemChannel : null;
}

(async () => {
  await client.login(token);
})().catch((err) => {
  console.error("Falha ao iniciar o bot:", err);
  process.exit(1);
});
