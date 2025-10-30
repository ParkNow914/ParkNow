#!/bin/bash

# Cores para saída
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para exibir mensagens de sucesso
success() {
  echo -e "${GREEN}[SUCESSO]${NC} $1"
}

# Função para exibir mensagens de aviso
warning() {
  echo -e "${YELLOW}[AVISO]${NC} $1"
}

# Função para exibir mensagens de erro e sair
error() {
  echo -e "${RED}[ERRO]${NC} $1"
  exit 1
}

# Verifica se o script está sendo executado como root
if [ "$(id -u)" -ne 0 ]; then
  error "Este script precisa ser executado como root"
fi

# Diretório do projeto
PROJECT_DIR="/var/www/parknow-payment-gateway"

# Verifica se o diretório do projeto existe
if [ ! -d "$PROJECT_DIR" ]; then
  warning "O diretório do projeto não existe. Criando..."
  mkdir -p "$PROJECT_DIR" || error "Falha ao criar o diretório do projeto"
  success "Diretório do projeto criado com sucesso em $PROJECT_DIR"
fi

# Navega até o diretório do projeto
cd "$PROJECT_DIR" || error "Falha ao acessar o diretório do projeto"

# Atualiza o repositório
success "Atualizando o repositório..."
git pull origin main || error "Falha ao atualizar o repositório"

# Instala as dependências
success "Instalando dependências..."
npm install --production=false || error "Falha ao instalar as dependências"

# Constrói o projeto
success "Construindo o projeto..."
npm run build || error "Falha ao construir o projeto"

# Reinicia os serviços
success "Reiniciando os serviços..."

# Para o PM2 se estiver em execução
if pm2 list | grep -q parknow-payment-gateway; then
  pm2 delete parknow-payment-gateway || warning "Falha ao parar o PM2, continuando..."
fi

# Inicia o PM2 com o ecossistema
pm2 start ecosystem.config.js --env production || error "Falha ao iniciar o PM2"

# Salva a configuração do PM2
pm2 save || warning "Falha ao salvar a configuração do PM2"

# Configura o PM2 para iniciar na inicialização do sistema
pm2 startup systemd -u node --hp /home/node || warning "Falha ao configurar o PM2 para iniciar na inicialização"

# Reinicia o Nginx
if systemctl is-active --quiet nginx; then
  systemctl restart nginx || warning "Falha ao reiniciar o Nginx"
else
  systemctl start nginx || warning "Falha ao iniciar o Nginx"
fi

# Verifica se o Docker está em execução
if ! systemctl is-active --quiet docker; then
  warning "O Docker não está em execução. Iniciando..."
  systemctl start docker || error "Falha ao iniciar o Docker"
fi

# Verifica se o Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
  error "Docker Compose não está instalado. Por favor, instale-o e tente novamente."
fi

# Navega até o diretório do projeto
cd "$PROJECT_DIR" || error "Falha ao acessar o diretório do projeto"

# Para e remove os containers antigos se existirem
if [ -f "docker-compose.prod.yml" ]; then
  docker-compose -f docker-compose.prod.yml down || warning "Falha ao parar os containers antigos"
fi

# Atualiza as imagens
success "Atualizando as imagens Docker..."
docker-compose -f docker-compose.prod.yml pull || warning "Falha ao atualizar as imagens Docker"

# Inicia os containers em segundo plano
success "Iniciando os containers..."
docker-compose -f docker-compose.prod.yml up -d || error "Falha ao iniciar os containers"

# Verifica o status dos containers
success "Verificando o status dos containers..."
docker-compose -f docker-compose.prod.yml ps || warning "Falha ao verificar o status dos containers"

# Exibe os logs iniciais
success "Exibindo os logs iniciais..."
docker-compose -f docker-compose.prod.yml logs --tail=20 || warning "Falha ao exibir os logs"

# Verifica se o serviço está acessível
success "Verificando se o serviço está acessível..."
if command -v curl &> /dev/null; then
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health | grep -q "200"; then
    success "O serviço está respondendo corretamente!"
  else
    warning "O serviço pode não estar respondendo corretamente. Verifique os logs para mais informações."
  fi
else
  warning "O comando 'curl' não está disponível. Não foi possível verificar se o serviço está acessível."
fi

# Conclusão
echo -e "\n${GREEN}Deploy concluído com sucesso!${NC}"
echo "Acesse a aplicação em: https://api.parknow.com.br"
echo "Acesse a documentação em: https://api.parknow.com.br/api-docs"
echo "Acesse o pgAdmin em: https://api.parknow.com.br:5050"

# Exibe os processos em execução
success "Processos em execução:"
pm2 list || warning "Falha ao listar os processos do PM2"

echo -e "\n${GREEN}Tudo pronto! A aplicação está online e funcionando.${NC}"
