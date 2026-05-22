const { PermissionsBitField } = require('discord.js');
const { getGuildData, saveData } = require('./database');

const moderationCommands = new Set([
  '!ban',
  '!unban',
  '!kick',
  '!timeout',
  '!untimeout',
  '!warn',
  '!warnings',
  '!clearwarns',
  '!clear',
  '!slowmode',
  '!lock',
  '!unlock'
]);

async function handleModerationCommand(message, data) {
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (!moderationCommands.has(command)) return false;

  if (command === '!ban') await banMember(message, args);
  if (command === '!unban') await unbanUser(message, args);
  if (command === '!kick') await kickMember(message, args);
  if (command === '!timeout') await timeoutMember(message, args);
  if (command === '!untimeout') await untimeoutMember(message, args);
  if (command === '!warn') warnMember(message, args, data);
  if (command === '!warnings') showWarnings(message, data);
  if (command === '!clearwarns') clearWarnings(message, data);
  if (command === '!clear') await clearMessages(message, args);
  if (command === '!slowmode') await setSlowmode(message, args);
  if (command === '!lock') await setChannelLock(message, true);
  if (command === '!unlock') await setChannelLock(message, false);

  return true;
}

async function banMember(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.BanMembers, 'banir membros')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.BanMembers, 'banir membros')) return;

  const target = message.mentions.members.first();
  const reason = args.slice(2).join(' ') || 'Sem motivo informado.';

  if (!target) {
    await message.reply('Use: !ban @usuario motivo');
    return;
  }

  if (!canModerate(message, target)) return;

  await target.ban({ reason });
  await message.channel.send(`${target.user.tag} foi banido. Motivo: ${reason}`);
}

async function unbanUser(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.BanMembers, 'desbanir membros')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.BanMembers, 'desbanir membros')) return;

  const userId = args[1];

  if (!userId) {
    await message.reply('Use: !unban id_do_usuario');
    return;
  }

  const unbanned = await message.guild.members.unban(userId).catch(async () => {
    await message.reply('Nao consegui desbanir esse ID. Confira se o usuario esta banido e se o ID esta correto.');
    return null;
  });

  if (!unbanned) return;

  await message.channel.send(`Usuario ${userId} foi desbanido.`);
}

async function kickMember(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.KickMembers, 'expulsar membros')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.KickMembers, 'expulsar membros')) return;

  const target = message.mentions.members.first();
  const reason = args.slice(2).join(' ') || 'Sem motivo informado.';

  if (!target) {
    await message.reply('Use: !kick @usuario motivo');
    return;
  }

  if (!canModerate(message, target)) return;

  await target.kick(reason);
  await message.channel.send(`${target.user.tag} foi expulso. Motivo: ${reason}`);
}

async function timeoutMember(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers, 'silenciar membros')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.ModerateMembers, 'silenciar membros')) return;

  const target = message.mentions.members.first();
  const duration = parseDuration(args[2]);
  const reason = args.slice(3).join(' ') || 'Sem motivo informado.';

  if (!target || !duration) {
    await message.reply('Use: !timeout @usuario 10m motivo. Unidades: s, m, h, d.');
    return;
  }

  if (duration > 28 * 24 * 60 * 60 * 1000) {
    await message.reply('O timeout maximo do Discord e 28 dias.');
    return;
  }

  if (!canModerate(message, target)) return;

  await target.timeout(duration, reason);
  await message.channel.send(`${target.user.tag} recebeu timeout. Motivo: ${reason}`);
}

async function untimeoutMember(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers, 'remover timeout')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.ModerateMembers, 'remover timeout')) return;

  const target = message.mentions.members.first();

  if (!target) {
    await message.reply('Use: !untimeout @usuario');
    return;
  }

  if (!canModerate(message, target)) return;

  await target.timeout(null, 'Timeout removido.');
  await message.channel.send(`Timeout removido de ${target.user.tag}.`);
}

function warnMember(message, args, data) {
  if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers, 'avisar membros')) return;

  const target = message.mentions.users.first();
  const reason = args.slice(2).join(' ') || 'Sem motivo informado.';

  if (!target) {
    message.reply('Use: !warn @usuario motivo');
    return;
  }

  if (target.bot) {
    message.reply('Nao faz sentido avisar um bot.');
    return;
  }

  const guildData = getGuildData(data, message.guild.id);
  if (!guildData.warnings[target.id]) guildData.warnings[target.id] = [];

  guildData.warnings[target.id].push({
    moderatorId: message.author.id,
    reason,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  message.channel.send(`${target} recebeu um aviso. Total: ${guildData.warnings[target.id].length}. Motivo: ${reason}`);
}

function showWarnings(message, data) {
  const target = message.mentions.users.first() ?? message.author;
  const guildData = getGuildData(data, message.guild.id);
  const warnings = guildData.warnings[target.id] ?? [];

  if (warnings.length === 0) {
    message.reply(`${target} nao tem avisos.`);
    return;
  }

  const lines = warnings.slice(0, 10).map((warning, index) => {
    return `${index + 1}. ${warning.reason} - por <@${warning.moderatorId}>`;
  });

  message.reply(`Avisos de ${target}:\n${lines.join('\n')}`);
}

function clearWarnings(message, data) {
  if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers, 'limpar avisos')) return;

  const target = message.mentions.users.first();

  if (!target) {
    message.reply('Use: !clearwarns @usuario');
    return;
  }

  const guildData = getGuildData(data, message.guild.id);
  guildData.warnings[target.id] = [];
  saveData(data);

  message.reply(`Avisos de ${target} foram limpos.`);
}

async function clearMessages(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages, 'apagar mensagens')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.ManageMessages, 'apagar mensagens')) return;

  const amount = Number(args[1]);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    await message.reply('Use: !clear quantidade. A quantidade deve ser de 1 a 100.');
    return;
  }

  const deleted = await message.channel.bulkDelete(amount, true).catch(async () => {
    await message.reply('Nao consegui apagar mensagens nesse canal.');
    return null;
  });

  if (!deleted) return;

  const reply = await message.channel.send(`${deleted.size} mensagens apagadas.`);
  setTimeout(() => reply.delete().catch(() => null), 5000);
}

async function setSlowmode(message, args) {
  if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels, 'alterar modo lento')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.ManageChannels, 'alterar modo lento')) return;

  const seconds = Number(args[1]);

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
    await message.reply('Use: !slowmode segundos. Valor permitido: 0 a 21600.');
    return;
  }

  await message.channel.setRateLimitPerUser(seconds);
  await message.reply(seconds === 0 ? 'Modo lento desativado.' : `Modo lento definido para ${seconds}s.`);
}

async function setChannelLock(message, locked) {
  if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels, locked ? 'trancar canal' : 'destrancar canal')) return;
  if (!hasBotPermission(message, PermissionsBitField.Flags.ManageChannels, locked ? 'trancar canal' : 'destrancar canal')) return;

  const everyoneRole = message.guild.roles.everyone;

  await message.channel.permissionOverwrites.edit(everyoneRole, {
    SendMessages: locked ? false : null
  });

  await message.reply(locked ? 'Canal trancado.' : 'Canal destrancado.');
}

function hasPermission(message, permission, action) {
  if (message.member.permissions.has(permission)) return true;

  message.reply(`Voce nao tem permissao para ${action}.`);
  return false;
}

function hasBotPermission(message, permission, action) {
  if (message.guild.members.me?.permissions.has(permission)) return true;

  message.reply(`Eu nao tenho permissao para ${action}.`);
  return false;
}

function canModerate(message, target) {
  if (target.id === message.author.id) {
    message.reply('Voce nao pode moderar voce mesmo.');
    return false;
  }

  if (target.id === message.client.user.id) {
    message.reply('Eu nao posso moderar eu mesmo.');
    return false;
  }

  if (!target.moderatable) {
    message.reply('Nao consigo moderar esse usuario. Meu cargo precisa estar acima do cargo dele.');
    return false;
  }

  if (message.member.roles.highest.comparePositionTo(target.roles.highest) <= 0 && message.guild.ownerId !== message.author.id) {
    message.reply('Voce nao pode moderar alguem com cargo igual ou acima do seu.');
    return false;
  }

  return true;
}

function parseDuration(value) {
  if (!value) return null;

  const match = value.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

module.exports = {
  handleModerationCommand
};
