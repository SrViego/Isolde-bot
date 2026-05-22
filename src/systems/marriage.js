const { getGuildData, saveData } = require('./database');

function handleMarriageCommand(message, data) {
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '!casar') {
    propose(message, data);
    return true;
  }

  if (command === '!aceitarcasamento') {
    acceptProposal(message, data);
    return true;
  }

  if (command === '!recusarcasamento') {
    rejectProposal(message, data);
    return true;
  }

  if (command === '!divorciar') {
    divorce(message, data);
    return true;
  }

  if (command === '!casamento') {
    showMarriage(message, data);
    return true;
  }

  return false;
}

function propose(message, data) {
  const target = message.mentions.users.first();
  const guildData = getGuildData(data, message.guild.id);

  if (!target) {
    message.reply('Use: !casar @usuario');
    return;
  }

  if (target.bot) {
    message.reply('Voce nao pode casar com bot.');
    return;
  }

  if (target.id === message.author.id) {
    message.reply('Voce nao pode casar com voce mesmo.');
    return;
  }

  if (guildData.marriages[message.author.id]) {
    message.reply('Voce ja esta casado(a). Use !divorciar antes.');
    return;
  }

  if (guildData.marriages[target.id]) {
    message.reply('Essa pessoa ja esta casada.');
    return;
  }

  guildData.proposals[target.id] = {
    from: message.author.id,
    createdAt: Date.now()
  };

  saveData(data);
  message.channel.send(`${target}, ${message.author} te pediu em casamento. Use !aceitarcasamento ou !recusarcasamento.`);
}

function acceptProposal(message, data) {
  const guildData = getGuildData(data, message.guild.id);
  const proposal = guildData.proposals[message.author.id];

  if (!proposal) {
    message.reply('Voce nao tem pedido de casamento pendente.');
    return;
  }

  if (guildData.marriages[message.author.id] || guildData.marriages[proposal.from]) {
    delete guildData.proposals[message.author.id];
    saveData(data);
    message.reply('Esse pedido nao pode mais ser aceito.');
    return;
  }

  guildData.marriages[message.author.id] = proposal.from;
  guildData.marriages[proposal.from] = message.author.id;
  delete guildData.proposals[message.author.id];

  saveData(data);
  message.channel.send(`${message.author} e <@${proposal.from}> agora estao casados.`);
}

function rejectProposal(message, data) {
  const guildData = getGuildData(data, message.guild.id);

  if (!guildData.proposals[message.author.id]) {
    message.reply('Voce nao tem pedido de casamento pendente.');
    return;
  }

  delete guildData.proposals[message.author.id];
  saveData(data);
  message.reply('Pedido de casamento recusado.');
}

function divorce(message, data) {
  const guildData = getGuildData(data, message.guild.id);
  const partnerId = guildData.marriages[message.author.id];

  if (!partnerId) {
    message.reply('Voce nao esta casado(a).');
    return;
  }

  delete guildData.marriages[message.author.id];
  delete guildData.marriages[partnerId];
  saveData(data);

  message.channel.send(`${message.author} se divorciou de <@${partnerId}>.`);
}

function showMarriage(message, data) {
  const target = message.mentions.users.first() ?? message.author;
  const guildData = getGuildData(data, message.guild.id);
  const partnerId = guildData.marriages[target.id];

  if (!partnerId) {
    message.reply(`${target} nao esta casado(a).`);
    return;
  }

  message.reply(`${target} esta casado(a) com <@${partnerId}>.`);
}

module.exports = {
  handleMarriageCommand
};
