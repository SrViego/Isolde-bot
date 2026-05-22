const { getUserData, saveData } = require('./database');

function handlePointsCommand(message, data) {
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '!pontos') {
    showPoints(message, data);
    return true;
  }

  if (command === '!daily') {
    claimDaily(message, data);
    return true;
  }

  if (command === '!rankpontos') {
    showPointsRank(message, data);
    return true;
  }

  return false;
}

function showPoints(message, data) {
  const target = message.mentions.users.first() ?? message.author;
  const userData = getUserData(data, message.guild.id, target.id);

  message.reply(`${target} tem ${userData.points} pontos.`);
}

function claimDaily(message, data) {
  const userData = getUserData(data, message.guild.id, message.author.id);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (userData.lastDailyAt && now - userData.lastDailyAt < oneDay) {
    const remaining = oneDay - (now - userData.lastDailyAt);
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    message.reply(`Voce ja pegou seus pontos diarios. Tente de novo em cerca de ${hours}h.`);
    return;
  }

  const reward = 100;
  userData.points += reward;
  userData.lastDailyAt = now;
  saveData(data);

  message.reply(`Voce recebeu ${reward} pontos diarios.`);
}

function showPointsRank(message, data) {
  const guildUsers = data.users[message.guild.id] ?? {};
  const ranking = Object.entries(guildUsers)
    .sort(([, a], [, b]) => b.points - a.points)
    .slice(0, 10);

  if (ranking.length === 0) {
    message.reply('Ainda nao tem ranking de pontos.');
    return;
  }

  const lines = ranking.map(([userId, userData], index) => {
    return `${index + 1}. <@${userId}> - ${userData.points} pontos`;
  });

  message.reply(`Ranking de pontos:
${lines.join('\n')}`);
}

module.exports = {
  handlePointsCommand
};
