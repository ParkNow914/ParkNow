const sharp = require('sharp');
const path = require('path');

// Caminhos dos arquivos
const logoPath = path.join(__dirname, '../public/img/logo.png');
const carIconPath = path.join(__dirname, '../public/img/car-icon-black.png');
const faviconPath = path.join(__dirname, '../public/favicon.ico');

// Cria um favicon apenas com o ícone do carro em preto
async function createCarFavicon() {
  try {
    // Primeiro, obtenha as dimensões da imagem
    const metadata = await sharp(logoPath).metadata();
    console.log('Dimensões da imagem original:', metadata.width, 'x', metadata.height);

    // Valores otimizados para recortar apenas o carro
    // Ajuste fino baseado na visualização da imagem
    const left = 1000;   // Posição horizontal do carro
    const top = 120;     // Posição vertical do carro
    const width = 500;   // Largura para o carro
    const height = 150;  // Altura para o carro

    console.log('Área de recorte:', { left, top, width, height });

    // Cria a versão preta do ícone do carro
    await sharp(logoPath)
      .extract({ left, top, width, height }) // Recorta a área do carro
      .tint({ r: 0, g: 0, b: 0 })           // Aplica cor preta
      .toFile(carIconPath);
    
    console.log('✅ Ícone do carro preto criado com sucesso em:', carIconPath);
    
    // Cria o favicon a partir do ícone do carro
    await sharp(carIconPath)
      .resize(32, 32, { 
        fit: 'contain', 
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Fundo transparente
      })
      .toFile(faviconPath);
      
    console.log('✅ Favicon com ícone do carro preto criado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao processar a imagem:', error);
  }
}

// Executa a função
createCarFavicon();
