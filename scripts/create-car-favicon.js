const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Caminhos dos arquivos
const logoPath = path.join(__dirname, '../public/img/logo.png');
const carIconPath = path.join(__dirname, '../public/img/car-icon-black.png');
const faviconPath = path.join(__dirname, '../public/favicon.ico');

// Cria um favicon apenas com o ícone do carro em preto
async function createCarFavicon() {
  try {
    // Recorta apenas a parte do carro (ajuste as coordenadas conforme necessário)
    // Valores aproximados - pode ser necessário ajustar
    const left = 10;    // Distância da esquerda
    const top = 10;     // Distância do topo
    const width = 100;  // Largura do recorte
    const height = 80;  // Altura do recorte

    // Cria a versão preta do ícone do carro
    await sharp(logoPath)
      .extract({ left, top, width, height }) // Recorta a área do carro
      .tint({ r: 0, g: 0, b: 0 })           // Aplica cor preta
      .toFile(carIconPath);
    
    console.log('✅ Ícone do carro preto criado com sucesso em:', carIconPath);
    
    // Cria o favicon a partir do ícone do carro
    await sharp(carIconPath)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }) // Mantém proporção com fundo transparente
      .toFile(faviconPath);
      
    console.log('✅ Favicon com ícone do carro preto criado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao processar a imagem:', error);
  }
}

// Executa a função
createCarFavicon();
