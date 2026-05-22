const { getUserData, saveData } = require('./database');

const xpCooldown = 60 * 1000;

function addXpFromMessage(message, data) {
  if (!message.guild || message.author.bot || message.content.startsWith('!')) return;

  const userData = getUserData(data, message.guild.id, message.author.id);
  const now = Date.now();

  if (now - userData.lastXpAt < xpCooldown) return;

  const gainedXp = Math.floor(Math.random() * 8) + 8;
  userData.xp += gainedXp;
  userData.lastXpAt = now;

  const neededXp = getNeededXp(userData.level);
  if (userData.xp >= neededXp) {
    userData.xp -= neededXp;
    userData.level += 1;
    message.channel.send(`${message.author} subiu para o nivel ${userData.level}.`);
  }

  saveData(data);
}

function handleXpCommand(message, data) {
  const command = message.content.trim().split(/\s+/)[0].toLowerCase();

  if (command === '!xp' || command === '!level') {
    showXp(message, data);
    return true;
  }

  if (command === '!rankxp') {
    showXpRank(message, data);
    return true;
  }

  return false;
}

function showXp(message, data) {
  const target = message.mentions.users.first() ?? message.author;
  const userData = getUserData(data, message.guild.id, target.id);
  const neededXp = getNeededXp(userData.level);

  message.reply(`${target} esta no nivel ${userData.level} com ${userData.xp}/${neededXp} XP.`);
}

function showXpRank(message, data) {
  const guildUsers = data.users[message.guild.id] ?? {};
  const ranking = Object.entries(guildUsers)
    .sort(([, a], [, b]) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.xp - a.xp;
    })
    .slice(0, 10);

  if (ranking.length === 0) {
    message.reply('Ainda nao tem ranking de XP.');
    return;
  }

  const lines = ranking.map(([userId, userData], index) => {
    return `${index + 1}. <@${userId}> - nivel ${userData.level} (${userData.xp} XP)`;
  });

  message.reply(`Ranking de XP:
${lines.join('\n')}`);
}

function getNeededXp(level) {
  return 100 + (level - 1) * 50;
}

module.exports = {
  addXpFromMessage,
  handleXpCommand
};
