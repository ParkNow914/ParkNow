const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Caminhos dos arquivos
const logoPath = path.join(__dirname, '../public/img/logo.png');
const blackLogoPath = path.join(__dirname, '../public/img/logo-black.png');

// Cria uma versão preta do logo
async function createBlackLogo() {
  try {
    await sharp(logoPath)
      .tint({ r: 0, g: 0, b: 0 }) // Aplica tom preto
      .toFile(blackLogoPath);
    
    console.log('✅ Logo preto criado com sucesso em:', blackLogoPath);
    
    // Atualiza o favicon com a nova versão preta
    await sharp(blackLogoPath)
      .resize(32, 32) // Tamanho ideal para favicon
      .toFile(path.join(__dirname, '../public/favicon.ico'));
      
    console.log('✅ Favicon preto atualizado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao processar a imagem:', error);
  }
}

// Executa a função
createBlackLogo();
