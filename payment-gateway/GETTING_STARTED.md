# Guia de Início Rápido - ParkNow Payment Gateway

Bem-vindo ao ParkNow Payment Gateway! Este guia irá ajudá-lo a configurar e executar o projeto em seu ambiente de desenvolvimento.

## Pré-requisitos

Antes de começar, certifique-se de ter instalado em sua máquina:

- [Node.js](https://nodejs.org/) (versão 16 ou superior)
- [npm](https://www.npmjs.com/) (geralmente vem com o Node.js)
- [Docker](https://www.docker.com/get-started) e [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/)

## Configuração Inicial

1. **Clone o repositório**
   ```bash
   git clone https://github.com/seu-usuario/parknow-payment-gateway.git
   cd parknow-payment-gateway
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   - Faça uma cópia do arquivo `.env.example` para `.env`
   - Edite o arquivo `.env` com suas credenciais e configurações

## Configuração do Mercado Pago

1. Acesse o [Painel do Mercado Pago](https://www.mercadopago.com.br/developers/panel/credentials)
2. Crie um novo aplicativo ou use um existente
3. Obtenha suas credenciais (Access Token e Public Key)
4. Adicione as credenciais ao arquivo `.env`

```env
# Mercado Pago Credenciais
MP_ACCESS_TOKEN=SEU_ACCESS_TOKEN_AQUI
MP_PUBLIC_KEY=SUA_PUBLIC_KEY_AQUI
```

## Iniciando o Ambiente de Desenvolvimento

### Usando Docker (Recomendado)

1. **Inicie os containers**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Acesse a documentação da API**
   Abra seu navegador em: http://localhost:3000/api-docs

3. **Acesse o pgAdmin**
   - URL: http://localhost:5050
   - Email: admin@parknow.com
   - Senha: admin

### Sem Docker

1. **Configure o banco de dados**
   - Instale o PostgreSQL
   - Crie um banco de dados chamado `payment_gateway_dev`
   - Atualize a string de conexão no arquivo `.env`

2. **Inicie o servidor**
   ```bash
   npm start
   ```

3. **Acesse a documentação da API**
   Abra seu navegador em: http://localhost:3000/api-docs

## Estrutura do Projeto

```
src/
├── config/           # Configurações da aplicação
├── controllers/      # Controladores das rotas
├── middlewares/      # Middlewares do Express
├── models/           # Modelos de dados
├── routes/           # Definição de rotas
├── services/         # Lógica de negócios
├── utils/            # Utilitários
└── index.js          # Ponto de entrada da aplicação
tests/               # Testes automatizados
```

## Comandos Úteis

- **Iniciar servidor de desenvolvimento**: `npm run dev`
- **Executar testes**: `npm test`
- **Executar lint**: `npm run lint`
- **Executar lint com auto-correção**: `npm run lint:fix`
- **Executar migrações do banco de dados**: `npm run migrate`
- **Desfazer última migração**: `npm run migrate:undo`

## Testando a API

Você pode testar a API usando a documentação interativa em http://localhost:3000/api-docs ou usando ferramentas como [Postman](https://www.postman.com/) ou [curl](https://curl.se/).

### Exemplo de requisição para criar um pagamento PIX

```bash
curl -X 'POST' \
  'http://localhost:3000/api/payments' \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 100.50,
    "description": "Pagamento de teste",
    "payer_email": "cliente@exemplo.com",
    "method": "pix"
  }'
```

### Exemplo de resposta

```json
{
  "id": "1234567890",
  "status": "pending",
  "point_of_interaction": {
    "qr_code": "00020126330014BR.GOV.BCB.PIX0111+551199999999952040000530398654040.005802BR5925FULANO DE TAL6008BRASILIA62070503***6304E2CA",
    "qr_code_base64": "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt...",
    "ticket_url": "https://www.mercadopago.com.br/payments/1234567890/ticket?caller_id=123456789&hash=abc123"
  }
}
```

## Configuração de Produção

Para implantar em produção, siga estas etapas:

1. Configure um servidor Linux (Ubuntu/Debian recomendado)
2. Instale Docker e Docker Compose
3. Configure um proxy reverso (Nginx ou Traefik recomendado)
4. Configure SSL com Let's Encrypt
5. Atualize as variáveis de ambiente no arquivo `.env`
6. Execute `docker-compose up -d`

## Solução de Problemas

### Erro de conexão com o banco de dados

Verifique se:
- O serviço do banco de dados está em execução
- As credenciais no arquivo `.env` estão corretas
- A porta 5432 não está sendo usada por outro serviço

### Erro de autenticação do Mercado Pago

Verifique se:
- O Access Token está correto
- O token não expirou
- Sua conta está ativa e verificada

### Erro de CORS

Verifique se:
- A origem da requisição está na lista de origens permitidas no arquivo `.env`
- O cabeçalho `Access-Control-Allow-Origin` está configurado corretamente

## Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Faça commit das suas alterações (`git commit -m 'Add some AmazingFeature'`)
4. Faça push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## Suporte

Para obter suporte, entre em contato com nossa equipe em suporte@parknow.com.br
