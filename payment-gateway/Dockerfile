# Estágio de construção
FROM node:18-alpine AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de definição de dependências
COPY package*.json ./

COPY yarn.lock ./


# Instala as dependências de produção
RUN npm install --production

# Copia o restante do código-fonte
COPY . .

# Estágio de produção
FROM container-registry.oracle.com/os/oraclelinux:8-slim

# Instala Node.js 16 e ferramentas necessárias
RUN microdnf install -y oracle-nodejs-release-el8 oraclelinux-developer-release-el8 && \
    microdnf module enable -y nodejs:16 && \
    microdnf install -y nodejs gcc-c++ make python3 && \
    microdnf clean all

# Cria o diretório da aplicação
WORKDIR /usr/src/app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências
RUN npm ci --only=production

# Copia o restante dos arquivos
COPY . .

# Expõe a porta da aplicação
EXPOSE 3000

# Define o usuário não-root
RUN groupadd -r node && useradd -r -g node node && \
    chown -R node:node /usr/src/app
USER node

# Comando para iniciar a aplicação
CMD ["node", "src/index.js"]
