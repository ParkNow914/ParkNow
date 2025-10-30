const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Caminhos dos arquivos
const logoPath = path.join(__dirname, '../public/img/logo.png');
const faviconPath = path.join(__dirname, '../public/favicon.ico');

// Verifica se o diretório de saída existe
const outputDir = path.dirname(faviconPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Tamanhos comuns para favicon
const sizes = [16, 32, 48, 64, 128, 256];

// Cria favicon.ico com múltiplos tamanhos
async function generateFavicon() {
  try {
    // Lê a imagem de origem
    const image = sharp(logoPath);
    
    // Cria um array de buffers para cada tamanho
    const buffers = await Promise.all(
      sizes.map(size => 
        image
          .clone()
          .resize(size, size)
          .toFormat('png')
          .toBuffer()
      )
    );
    
    // Cria o favicon.ico com todos os tamanhos
    await sharp({
      create: {
        width: sizes[sizes.length - 1],
        height: sizes[sizes.length - 1],
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(buffers.map((buffer, i) => ({
        input: buffer,
        top: 0,
        left: 0,
      })))
      .toFile(faviconPath);
      
    console.log('✅ Favicon gerado com sucesso em:', faviconPath);
  } catch (error) {
    console.error('❌ Erro ao gerar favicon:', error);
    process.exit(1);
  }
}

// Executa a geração
generateFavicon();
