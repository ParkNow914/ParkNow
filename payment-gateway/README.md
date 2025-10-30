# Gateway de Pagamentos ParkNow

Gateway de pagamentos gratuito para o ParkNow, integrado com Mercado Pago PF, suportando PIX, cartão de crédito, cartão de débito e split de pagamentos.

## 🚀 Recursos

- 💰 **PIX** - Geração de QR Code PIX dinâmico
- 💳 **Cartão de Crédito/Débito** - Pagamentos seguros com checkout transparente
- 🤝 **Marketplace** - Split automático entre ParkNow e estacionamentos
- 🔒 **Seguro** - Sem exposição de domínio, sem webhooks públicos
- 🆓 **100% Gratuito** - Sem custos de infraestrutura, domínio ou CNPJ
- 🚀 **Pronto para Produção** - Containerizado com Docker e fácil de implantar

## 📋 Pré-requisitos

- Node.js 16+ e npm/yarn
- Docker e Docker Compose
- Conta no Mercado Pago PF (nível 6 de KYC)

## 🛠️ Configuração

1. **Clone o repositório**
   ```bash
   git clone https://github.com/seu-usuario/parknow-payment-gateway.git
   cd parknow-payment-gateway
   ```

2. **Configure as variáveis de ambiente**
   ```bash
   cp .env.example .env
   ```
   Edite o arquivo `.env` com suas credenciais do Mercado Pago e outras configurações.

3. **Instale as dependências**
   ```bash
   npm install
   # ou
   yarn
   ```

4. **Inicie os containers com Docker**
   ```bash
   docker-compose up -d
   ```
   Isso irá iniciar:
   - Aplicação Node.js na porta 3000
   - Banco de dados PostgreSQL na porta 5432
   - PgAdmin na porta 5050 (acesse em http://localhost:5050)

## 🚀 Como usar

### Criar um pagamento PIX

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -d '{
    "amount": 100.50,
    "description": "Estacionamento 24h",
    "payer_email": "cliente@exemplo.com",
    "method": "pix"
  }'
```

### Verificar status de um pagamento

```bash
curl -X GET http://localhost:3000/api/payments/PAYMENT_ID \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

## 🔍 Testes

```bash
# Execute os testes unitários
npm test

# Execute os testes de integração
npm run test:integration
```

## 🛠️ Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `MP_ACCESS_TOKEN` | Sim | Token de acesso do Mercado Pago |
| `MP_PUBLIC_KEY` | Não | Chave pública do Mercado Pago |
| `DATABASE_URL` | Não | URL de conexão com o PostgreSQL |
| `ALLOWED_ORIGINS` | Não | Origens permitidas para CORS |
| `NODE_ENV` | Não | Ambiente de execução (development/production) |

## 🏗️ Estrutura do Projeto

```
/project-root
├── src/
│   ├── config/           # Configurações da aplicação
│   ├── controllers/       # Controladores das rotas
│   ├── middlewares/       # Middlewares do Express
│   ├── models/            # Modelos de dados
│   ├── routes/            # Definição de rotas
│   ├── services/          # Lógica de negócios
│   ├── utils/             # Utilitários
│   └── index.js           # Ponto de entrada da aplicação
├── tests/                 # Testes unitários e de integração
├── .env.example           # Exemplo de variáveis de ambiente
├── docker-compose.yml     # Configuração Docker
├── Dockerfile            # Configuração do container
└── package.json          # Dependências e scripts
```

## 📝 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🤝 Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir uma issue ou enviar um pull request.

---

Desenvolvido com ❤️ pela equipe ParkNow
