const { writeFileSync } = require('fs');
const { resolve } = require('path');
const sharp = require('sharp');

// SVG do ícone de carro (o mesmo do HTML)
const carSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path fill="#000000" d="M135.2 117.4L109.1 192H402.9l-26.1-74.6C372.3 104.6 360.2 96 346.6 96H165.4c-13.6 0-25.7 8.6-30.2 21.4zM39.6 196.8L74.8 96.3C88.3 57.8 124.6 32 165.4 32H346.6c40.8 0 77.1 25.8 90.6 64.3l35.2 100.5c23.2 9.6 39.6 32.5 39.6 59.2V400v48c0 17.7-14.3 32-32 32H448c-17.7 0-32-14.3-32-32V400H96v48c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V400 256c0-26.7 16.4-49.6 39.6-59.2zM128 288a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/>
</svg>
`;

async function createFavicon() {
  try {
    const outputPath = resolve(__dirname, '../public/favicon.ico');
    
    // Converte SVG para PNG e depois para ICO
    await sharp(Buffer.from(carSvg))
      .resize(32, 32) // Tamanho 32x32 para favicon
      .toFile(outputPath);
    
    console.log('✅ Favicon criado com sucesso em:', outputPath);
  } catch (error) {
    console.error('❌ Erro ao criar favicon:', error);
  }
}

// Executa a função
createFavicon();
