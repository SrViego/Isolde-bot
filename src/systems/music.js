// =============================================
// SISTEMA DE MÚSICA DESATIVADO POR ENQUANTO
// =============================================

async function handleMusicCommand(message) {
  const content = message.content.toLowerCase().trim();
  const musicCommands = ['!play', '!p', '!skip', '!stop', '!queue', '!fila', '!pause', '!resume', '!continuar', '!np', '!tocando', '!volume'];

  if (musicCommands.some(cmd => content.startsWith(cmd))) {
    await message.reply('🎵 **Sistema de música desativado por enquanto.**\nTava dando muito problema pra conectar no canal de voz... quando eu tiver paciência de tentar de novo eu te aviso, idiota.');
    return true;
  }

  return false;
}

module.exports = { handleMusicCommand };