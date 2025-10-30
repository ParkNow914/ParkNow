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

    // Valores específicos para recortar apenas o carro
    // Estes valores foram ajustados com base na visualização da imagem
    const left = 700;    // Ajuste fino para pegar o carro
    const top = 100;     // Ajuste fino para posição vertical
    const width = 800;   // Largura suficiente para o carro
    const height = 200;  // Altura suficiente para o carro

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
