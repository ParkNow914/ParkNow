const fs = require('fs');
const path = require('path');

// Caminhos dos arquivos
const logoPath = path.join(__dirname, '../public/img/logo.png');
const faviconPath = path.join(__dirname, '../public/favicon.ico');

// Simplesmente copia o arquivo de logo para favicon.ico
// Em um ambiente real, você usaria uma ferramenta como o GIMP
// ou um conversor online para criar um favicon.ico adequado
fs.copyFile(logoPath, faviconPath, (err) => {
  if (err) {
    console.error('❌ Erro ao copiar o arquivo:', err);
    return;
  }
  console.log('✅ Arquivo favicon.ico criado com sucesso!');
  console.log('Observação: Para melhores resultados, use uma ferramenta online para converter sua logo para .ico');
  console.log('Recomendação: Use https://realfavicongenerator.net/ para criar um favicon.ico otimizado');
});
