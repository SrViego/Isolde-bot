const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dataFile = path.join(dataDir, 'database.json');

const defaultData = {
  users: {},
  marriages: {},
  proposals: {},
  warnings: {}
};

function loadData() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    saveData(defaultData);
    return structuredClone(defaultData);
  }

  const rawData = fs.readFileSync(dataFile, 'utf8');
  return {
    ...structuredClone(defaultData),
    ...JSON.parse(rawData)
  };
}

function saveData(data) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getGuildData(data, guildId) {
  if (!data.users[guildId]) data.users[guildId] = {};
  if (!data.marriages[guildId]) data.marriages[guildId] = {};
  if (!data.proposals[guildId]) data.proposals[guildId] = {};
  if (!data.warnings[guildId]) data.warnings[guildId] = {};

  return {
    users: data.users[guildId],
    marriages: data.marriages[guildId],
    proposals: data.proposals[guildId],
    warnings: data.warnings[guildId]
  };
}

function getUserData(data, guildId, userId) {
  const guildData = getGuildData(data, guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      points: 0,
      xp: 0,
      level: 1,
      lastXpAt: 0,
      inventory: {}
    };
  }

  if (!guildData.users[userId].inventory) {
    guildData.users[userId].inventory = {};
  }

  return guildData.users[userId];
}

module.exports = {
  getGuildData,
  getUserData,
  loadData,
  saveData
};
