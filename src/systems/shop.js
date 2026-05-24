const { getUserData, saveData } = require('./database');

const shopItems = [
  {
    id: 'cafe',
    name: 'Cafe de Dirtmouth',
    price: 50,
    description: 'Um cafe simples para guardar no inventario.'
  },
  {
    id: 'amuleto',
    name: 'Amuleto Brilhante',
    price: 150,
    description: 'Item colecionavel da loja de pontos.'
  },
  {
    id: 'mapa',
    name: 'Mapa Antigo',
    price: 250,
    description: 'Para quem gosta de explorar Hallownest.'
  },
  {
    id: 'coroa',
    name: 'Coroa Palida',
    price: 750,
    description: 'Item caro para ostentar no inventario.'
  }
];

function handleShopCommand(message, data) {
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '!loja' || command === '!shop') {
    showShop(message);
    return true;
  }

  if (command === '!comprar' || command === '!buy') {
    buyItem(message, args, data);
    return true;
  }

  if (command === '!inventario' || command === '!inv') {
    showInventory(message, data);
    return true;
  }

  if (command === '!usar') {
    useItem(message, args, data);
    return true;
  }

  return false;
}

function showShop(message) {
  const lines = shopItems.map((item) => {
    return `**${item.id}** - ${item.name} - ${item.price} pontos\n${item.description}`;
  });

  message.reply(`Loja de pontos:\n\n${lines.join('\n\n')}\n\nUse: !comprar id_do_item`);
}

function buyItem(message, args, data) {
  const itemId = args[1]?.toLowerCase();
  const item = shopItems.find((shopItem) => shopItem.id === itemId);

  if (!item) {
    message.reply('Item nao encontrado. Use !loja para ver os itens disponiveis.');
    return;
  }

  const userData = getUserData(data, message.guild.id, message.author.id);

  if (userData.points < item.price) {
    message.reply(`Voce precisa de ${item.price} pontos para comprar **${item.name}**. Voce tem ${userData.points}.`);
    return;
  }

  userData.points -= item.price;
  userData.inventory[item.id] = (userData.inventory[item.id] ?? 0) + 1;
  saveData(data);

  message.reply(`Voce comprou **${item.name}** por ${item.price} pontos. Saldo atual: ${userData.points}.`);
}

function showInventory(message, data) {
  const target = message.mentions.users.first() ?? message.author;
  const userData = getUserData(data, message.guild.id, target.id);
  const entries = Object.entries(userData.inventory).filter(([, amount]) => amount > 0);

  if (entries.length === 0) {
    message.reply(`${target} ainda nao tem itens no inventario.`);
    return;
  }

  const lines = entries.map(([itemId, amount]) => {
    const item = shopItems.find((shopItem) => shopItem.id === itemId);
    const name = item ? item.name : itemId;
    return `${name} (${itemId}) x${amount}`;
  });

  message.reply(`Inventario de ${target}:\n${lines.join('\n')}`);
}

function useItem(message, args, data) {
  const itemId = args[1]?.toLowerCase();
  const item = shopItems.find((shopItem) => shopItem.id === itemId);

  if (!item) {
    message.reply('Item nao encontrado. Use !inventario para ver seus itens.');
    return;
  }

  const userData = getUserData(data, message.guild.id, message.author.id);
  const amount = userData.inventory[item.id] ?? 0;

  if (amount <= 0) {
    message.reply(`Voce nao tem **${item.name}** no inventario.`);
    return;
  }

  userData.inventory[item.id] -= 1;
  saveData(data);

  message.reply(`${message.author} usou **${item.name}**.`);
}

module.exports = {
  handleShopCommand,
  shopItems
};
