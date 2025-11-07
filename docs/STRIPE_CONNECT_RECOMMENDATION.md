# Recomendação de Gateway de Pagamento com Split/Marketplace para ParkNow

**Data:** 2024-11-07  
**Solicitação:** Gateway de pagamento gratuito com split de pagamento (marketplace) para repasse de porcentagem aos estacionamentos

---

## 🏆 TOP 1 RECOMENDADO: **Stripe Connect**

### Por que Stripe Connect é a melhor opção:

1. **✅ 100% Gratuito para Começar**
   - Sandbox/ambiente de teste completamente gratuito
   - Sem mensalidade ou taxa de setup
   - Pague apenas quando processar pagamentos reais

2. **✅ Split de Pagamento Nativo (Marketplace)**
   - Sistema de "Connected Accounts" perfeito para marketplace
   - Split automático entre plataforma (ParkNow) e vendedores (Estacionamentos)
   - Transferências automáticas para contas dos estacionamentos

3. **✅ Funciona SEM CNPJ (Sandbox e Produção)**
   - Sandbox: Não precisa de documentos
   - Produção: Aceita pessoa física (CPF) inicialmente
   - Upgrade para CNPJ opcional posteriormente

4. **✅ Melhor Infraestrutura do Brasil**
   - Processamento local (Stripe Brasil)
   - Suporte completo a PIX, Boleto, Cartões brasileiros
   - APIs em português, documentação excelente
   - SDKs oficiais para Node.js

5. **✅ Compliance e Segurança**
   - PCI-DSS Level 1 certificado
   - Gerenciamento de fraude incluso
   - 3D Secure automático
   - Checkout seguro pronto

---

## 📊 Comparação: Stripe vs Alternativas

| Característica | Stripe Connect | Pagar.me | PagSeguro | Mercado Pago |
|---------------|----------------|----------|-----------|--------------|
| **Split nativo** | ✅ Excelente | ✅ Bom | ❌ Limitado | ✅ Bom |
| **Sandbox grátis** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim |
| **Sem CNPJ (teste)** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim |
| **Sem CNPJ (prod)** | ✅ CPF aceito | ❌ Precisa CNPJ | ⚠️ Limitado | ⚠️ Limitado |
| **Taxa padrão** | 3.99% + R$0.39 | 4.99% + R$0.39 | 4.99% + R$0.40 | 4.99% + R$0.39 |
| **PIX** | ✅ 0.99% | ✅ 0.99% | ✅ Variável | ✅ Variável |
| **Boleto** | ✅ R$2.49 | ✅ R$2.49 | ✅ R$3.49 | ✅ R$2.90 |
| **Documentação** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **API Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Node.js SDK** | ✅ Oficial | ✅ Oficial | ⚠️ Comunidade | ✅ Oficial |
| **Webhook confiável** | ✅ Excelente | ✅ Bom | ⚠️ Regular | ✅ Bom |

**Vencedor:** ✅ **Stripe Connect**

---

## 💰 Como Funciona o Split no Stripe Connect

### Modelo de Split Recomendado: **"Standard Accounts"**

```
FLUXO DE DINHEIRO:

Cliente paga R$ 100,00 por reserva
         ↓
ParkNow (plataforma) recebe R$ 100,00
         ↓
ParkNow retém: R$ 15,00 (15% comissão)
         ↓
Estacionamento recebe: R$ 85,00 (85%)
         ↓
Stripe desconta taxas de ambos:
  - ParkNow: 3.99% + R$0.39 dos R$ 100,00
  - Estacionamento: isento (ou divide taxa)
```

### Arquitetura do Split:

```
┌─────────────────────────────────────────────────────┐
│              STRIPE CONNECT                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐                              │
│  │  ParkNow         │  (Platform Account)          │
│  │  Conta Principal │                              │
│  └────────┬─────────┘                              │
│           │                                         │
│           │ Connects to                             │
│           ▼                                         │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │ Estacionamento 1 │  │ Estacionamento 2 │  ...   │
│  │ (Connected Acc)  │  │ (Connected Acc)  │        │
│  └──────────────────┘  └──────────────────┘        │
│                                                     │
│  Cada estacionamento tem sua própria conta         │
│  Transferências automáticas após cada venda        │
│  Dashboard individual para cada um                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Implementação Passo a Passo

### Fase 1: Setup Inicial (Sandbox - Gratuito)

**1. Criar conta Stripe**
```bash
# Acesse: https://dashboard.stripe.com/register
# - Use email pessoal (não precisa CNPJ)
# - Selecione "Brasil" como país
# - Ative modo "Test" (sandbox)
```

**2. Instalar SDK**
```bash
npm install stripe --save
```

**3. Configurar variáveis de ambiente**
```env
# .env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx  # Chave de teste
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_PLATFORM_FEE_PERCENT=15  # 15% para ParkNow
```

### Fase 2: Implementação do Split

**Arquivo:** `services/stripeConnectService.js`

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeConnectService {
    /**
     * Cria uma conta conectada para um estacionamento
     * @param {Object} estacionamentoData - Dados do estacionamento
     * @returns {Promise<Object>} Conta Stripe criada
     */
    async criarContaConectada(estacionamentoData) {
        try {
            const account = await stripe.accounts.create({
                type: 'standard', // Ou 'express' para onboarding mais simples
                country: 'BR',
                email: estacionamentoData.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                    pix_payments: { requested: true }, // PIX!
                    boleto_payments: { requested: true }
                },
                business_profile: {
                    name: estacionamentoData.nome,
                    mcc: '7523', // Código MCC para estacionamentos
                    url: estacionamentoData.website
                }
            });

            // Salvar account.id no banco de dados
            await estacionamentoModel.update(
                estacionamentoData.id,
                { stripe_account_id: account.id }
            );

            return account;
        } catch (error) {
            logger.error('Erro ao criar conta conectada:', error);
            throw error;
        }
    }

    /**
     * Gera link para onboarding do estacionamento
     * @param {string} stripeAccountId - ID da conta Stripe
     * @returns {Promise<string>} URL de onboarding
     */
    async gerarLinkOnboarding(stripeAccountId) {
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${process.env.FRONTEND_URL}/estacionamentos/conectar/refresh`,
            return_url: `${process.env.FRONTEND_URL}/estacionamentos/conectar/sucesso`,
            type: 'account_onboarding'
        });

        return accountLink.url;
    }

    /**
     * Processa pagamento com split automático
     * @param {Object} pagamentoData - Dados do pagamento
     * @returns {Promise<Object>} Resultado do pagamento
     */
    async processarPagamentoComSplit(pagamentoData) {
        const {
            valor,
            metodo,
            reserva_id,
            estacionamento_stripe_account_id,
            cliente_email
        } = pagamentoData;

        try {
            // Calcula comissão da plataforma
            const comissaoPlatforma = Math.round(
                valor * (process.env.STRIPE_PLATFORM_FEE_PERCENT / 100)
            );
            const valorEstacionamento = valor - comissaoPlatforma;

            // Cria Payment Intent com split
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(valor * 100), // Centavos
                currency: 'brl',
                payment_method_types: ['card', 'pix', 'boleto'],
                
                // SPLIT: Define onde o dinheiro vai
                application_fee_amount: Math.round(comissaoPlatforma * 100),
                transfer_data: {
                    destination: estacionamento_stripe_account_id
                },

                metadata: {
                    reserva_id: reserva_id,
                    tipo: 'reserva_estacionamento'
                },

                receipt_email: cliente_email,
                description: `Reserva #${reserva_id} - Estacionamento`
            });

            // Salvar no banco
            await pagamentoModel.criarPagamento({
                reserva_id,
                metodo: 'stripe_' + metodo,
                valor,
                status: 'pendente',
                dados_adicionais: {
                    stripe_payment_intent_id: paymentIntent.id,
                    comissao_plataforma: comissaoPlatforma,
                    valor_estacionamento: valorEstacionamento
                }
            });

            return {
                payment_intent_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                status: paymentIntent.status
            };

        } catch (error) {
            logger.error('Erro ao processar pagamento com split:', error);
            throw error;
        }
    }

    /**
     * Processa pagamento PIX com split
     */
    async processarPixComSplit(pagamentoData) {
        const paymentIntent = await this.processarPagamentoComSplit({
            ...pagamentoData,
            metodo: 'pix'
        });

        // PIX gera QR Code automaticamente via Stripe
        return {
            ...paymentIntent,
            pix_qr_code: paymentIntent.next_action?.pix_display_qr_code?.image_url_svg,
            pix_code: paymentIntent.next_action?.pix_display_qr_code?.data
        };
    }

    /**
     * Webhook handler para eventos Stripe
     */
    async processarWebhook(req) {
        const sig = req.headers['stripe-signature'];
        
        try {
            const event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );

            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePagamentoSucesso(event.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    await this.handlePagamentoFalha(event.data.object);
                    break;

                case 'transfer.created':
                    // Transferência para estacionamento criada
                    logger.info('Transferência criada:', event.data.object);
                    break;

                case 'account.updated':
                    // Conta do estacionamento atualizada
                    await this.handleContaAtualizada(event.data.object);
                    break;
            }

            return { received: true };
        } catch (err) {
            logger.error('Erro ao processar webhook Stripe:', err);
            throw err;
        }
    }

    async handlePagamentoSucesso(paymentIntent) {
        const reservaId = paymentIntent.metadata.reserva_id;

        // Atualizar pagamento
        await pagamentoModel.atualizarStatusPorStripeId(
            paymentIntent.id,
            'aprovado'
        );

        // Confirmar reserva
        await reservaModel.atualizarStatus(reservaId, 'confirmada');

        // Notificar cliente
        await notificationService.enviarNotificacao(/* ... */);
    }
}

module.exports = new StripeConnectService();
```

### Fase 3: Controller de Pagamento Stripe

**Arquivo:** `controllers/stripePaymentController.js`

```javascript
const stripeConnectService = require('../services/stripeConnectService');

class StripePaymentController {
    /**
     * Criar reserva com pagamento Stripe (PIX, Cartão, Boleto)
     */
    async criarReservaComStripe(req, res, next) {
        try {
            const { 
                estacionamento_id, 
                vaga_id, 
                data_entrada, 
                data_saida,
                metodo_pagamento // 'pix', 'card', 'boleto'
            } = req.body;

            const userId = req.user.id;

            // 1. Buscar estacionamento e verificar se tem conta Stripe
            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            
            if (!estacionamento.stripe_account_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Estacionamento não configurado para pagamentos online'
                });
            }

            // 2. Calcular valor da reserva
            const valor = await reservaService.calcularValor(
                data_entrada, 
                data_saida, 
                estacionamento.preco_hora
            );

            // 3. Criar reserva no banco
            const reserva = await reservaService.criarReserva({
                usuario_id: userId,
                estacionamento_id,
                vaga_id,
                data_entrada,
                data_saida,
                valor_total: valor,
                status: 'pendente',
                status_pagamento: 'pendente'
            });

            // 4. Processar pagamento com split
            let resultado;
            
            if (metodo_pagamento === 'pix') {
                resultado = await stripeConnectService.processarPixComSplit({
                    valor,
                    reserva_id: reserva.id,
                    estacionamento_stripe_account_id: estacionamento.stripe_account_id,
                    cliente_email: req.user.email
                });
            } else {
                resultado = await stripeConnectService.processarPagamentoComSplit({
                    valor,
                    metodo: metodo_pagamento,
                    reserva_id: reserva.id,
                    estacionamento_stripe_account_id: estacionamento.stripe_account_id,
                    cliente_email: req.user.email
                });
            }

            res.json({
                success: true,
                data: {
                    reserva,
                    pagamento: resultado
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Conectar estacionamento ao Stripe
     */
    async conectarEstacionamento(req, res, next) {
        try {
            const { estacionamento_id } = req.params;
            const userId = req.user.id;

            // Verificar permissão
            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            if (estacionamento.usuario_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Sem permissão'
                });
            }

            // Criar conta conectada
            const account = await stripeConnectService.criarContaConectada({
                id: estacionamento_id,
                nome: estacionamento.nome,
                email: req.user.email,
                website: estacionamento.website
            });

            // Gerar link de onboarding
            const onboardingUrl = await stripeConnectService.gerarLinkOnboarding(
                account.id
            );

            res.json({
                success: true,
                data: {
                    account_id: account.id,
                    onboarding_url: onboardingUrl
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Webhook Stripe
     */
    async webhook(req, res) {
        try {
            await stripeConnectService.processarWebhook(req);
            res.json({ received: true });
        } catch (error) {
            logger.error('Erro no webhook:', error);
            res.status(400).send(`Webhook Error: ${error.message}`);
        }
    }
}

module.exports = new StripePaymentController();
```

### Fase 4: Rotas

**Arquivo:** `routes/stripeRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const stripePaymentController = require('../controllers/stripePaymentController');
const { authenticate } = require('../middleware/auth');

// Criar reserva com pagamento Stripe
router.post(
    '/reservas/stripe',
    authenticate,
    stripePaymentController.criarReservaComStripe
);

// Conectar estacionamento
router.post(
    '/estacionamentos/:estacionamento_id/conectar-stripe',
    authenticate,
    stripePaymentController.conectarEstacionamento
);

// Webhook (raw body necessário)
router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    stripePaymentController.webhook
);

module.exports = router;
```

---

## 💵 Custos e Taxas

### Stripe Connect - Modelo Gratuito

**Setup:**
- ✅ R$ 0,00 - Sem taxa de configuração
- ✅ R$ 0,00 - Sem mensalidade
- ✅ R$ 0,00 - Sandbox ilimitado

**Transações (somente quando processar):**

| Método | Taxa Stripe | Taxa ParkNow | Total Cliente |
|--------|-------------|--------------|---------------|
| **PIX** | 0.99% | 15% do valor | Valor + 0.99% |
| **Cartão Crédito** | 3.99% + R$0.39 | 15% do valor | Valor + 3.99% + R$0.39 |
| **Cartão Débito** | 2.99% + R$0.39 | 15% do valor | Valor + 2.99% + R$0.39 |
| **Boleto** | R$ 2.49 | 15% do valor | Valor + R$2.49 |

**Exemplo Prático:**

```
Reserva de R$ 100,00 paga com PIX:

Cliente paga: R$ 100,99 (R$ 100,00 + 0.99%)
  ↓
Stripe recebe: R$ 100,99
Stripe retém taxa: R$ 0,99
  ↓
ParkNow recebe: R$ 100,00
ParkNow retém comissão: R$ 15,00 (15%)
  ↓
Estacionamento recebe: R$ 85,00
```

**Obs:** Você pode escolher se a taxa do Stripe é do cliente ou dividida entre plataforma/estacionamento.

---

## 🔧 Configuração Técnica

### Migração do Banco de Dados

**Arquivo:** `migrations/YYYYMMDD_add_stripe_fields.sql`

```sql
-- Adicionar campos Stripe na tabela estacionamentos
ALTER TABLE estacionamentos
ADD COLUMN stripe_account_id VARCHAR(255) UNIQUE,
ADD COLUMN stripe_account_status VARCHAR(50) DEFAULT 'not_connected',
ADD COLUMN stripe_onboarded_at TIMESTAMP,
ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT FALSE;

-- Adicionar índice
CREATE INDEX idx_estacionamentos_stripe_account ON estacionamentos(stripe_account_id);

-- Adicionar campos Stripe na tabela pagamentos
ALTER TABLE pagamentos
ADD COLUMN stripe_payment_intent_id VARCHAR(255) UNIQUE,
ADD COLUMN stripe_transfer_id VARCHAR(255),
ADD COLUMN comissao_plataforma DECIMAL(10, 2),
ADD COLUMN valor_estacionamento DECIMAL(10, 2);

-- Índice
CREATE INDEX idx_pagamentos_stripe_pi ON pagamentos(stripe_payment_intent_id);

COMMENT ON COLUMN estacionamentos.stripe_account_id IS 'ID da conta conectada no Stripe';
COMMENT ON COLUMN pagamentos.stripe_payment_intent_id IS 'ID do PaymentIntent no Stripe';
COMMENT ON COLUMN pagamentos.comissao_plataforma IS 'Valor retido pela ParkNow';
COMMENT ON COLUMN pagamentos.valor_estacionamento IS 'Valor transferido ao estacionamento';
```

### Atualizar .env.example

```env
# Stripe Connect
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_PLATFORM_FEE_PERCENT=15
```

---

## 📱 Frontend - Integração

### Exemplo de Checkout PIX com Stripe

```javascript
// Frontend: components/StripePixCheckout.jsx
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

function StripePixCheckout({ reserva }) {
    const stripe = useStripe();
    const elements = useElements();

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!stripe || !elements) return;

        // Confirmar pagamento
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/reservas/${reserva.id}/confirmacao`,
            },
        });

        if (error) {
            console.error(error.message);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <PaymentElement />
            <button type="submit" disabled={!stripe}>
                Pagar com PIX
            </button>
        </form>
    );
}
```

---

## ✅ Checklist de Implementação

### Fase 1: Sandbox (1-2 dias)
- [ ] Criar conta Stripe (modo teste)
- [ ] Instalar SDK: `npm install stripe`
- [ ] Configurar variáveis de ambiente
- [ ] Criar `stripeConnectService.js`
- [ ] Criar `stripePaymentController.js`
- [ ] Adicionar rotas em `routes/stripeRoutes.js`
- [ ] Testar criação de conta conectada
- [ ] Testar split de pagamento em sandbox

### Fase 2: Banco de Dados (1 dia)
- [ ] Criar migration para campos Stripe
- [ ] Executar migration
- [ ] Atualizar models (estacionamentoModel, pagamentoModel)

### Fase 3: Testes (2-3 dias)
- [ ] Testar PIX com split
- [ ] Testar cartão com split
- [ ] Testar boleto com split
- [ ] Testar webhooks
- [ ] Testar onboarding de estacionamento
- [ ] Validar cálculo de comissões

### Fase 4: Produção (quando tiver movimento)
- [ ] Obter aprovação Stripe (CPF ou CNPJ)
- [ ] Trocar chaves de teste por produção
- [ ] Configurar webhook em produção
- [ ] Ativar modo live

**Total estimado:** 4-6 dias de desenvolvimento

---

## 🎓 Recursos e Documentação

### Stripe Connect
- **Documentação oficial:** https://stripe.com/docs/connect
- **Guia Brasil:** https://stripe.com/br/connect
- **Dashboard:** https://dashboard.stripe.com/test/dashboard
- **Playground API:** https://stripe.com/docs/api

### Tutoriais Recomendados
1. **Stripe Connect Onboarding:** https://stripe.com/docs/connect/enable-payment-acceptance-guide
2. **Split Payments:** https://stripe.com/docs/connect/charges
3. **PIX no Stripe:** https://stripe.com/docs/payments/pix
4. **Webhooks:** https://stripe.com/docs/webhooks

### SDK Node.js
- **GitHub:** https://github.com/stripe/stripe-node
- **NPM:** https://www.npmjs.com/package/stripe
- **Docs:** https://stripe.com/docs/api?lang=node

---

## 🆚 Por que NÃO escolher as alternativas?

### ❌ Pagar.me
- ✅ Bom para split
- ❌ **Exige CNPJ em produção**
- ❌ API mais complexa
- ❌ Documentação inferior

### ❌ PagSeguro
- ⚠️ Split limitado (não é marketplace real)
- ❌ **Exige CNPJ em produção**
- ❌ API antiga e complicada
- ❌ Webhooks não confiáveis

### ❌ Mercado Pago
- ✅ Bom para split (Marketplace)
- ⚠️ Funciona com CPF mas com limitações
- ⚠️ Documentação regular
- ⚠️ Taxas mais altas que Stripe PIX

---

## 🚀 Próximos Passos IMEDIATOS

1. **Criar conta Stripe agora (5 minutos)**
   - Acesse: https://dashboard.stripe.com/register
   - Use seu email pessoal
   - Ative modo "Test"

2. **Testar no sandbox (1-2 horas)**
   - Siga a implementação acima
   - Use cartões de teste: https://stripe.com/docs/testing
   - Validar split está funcionando

3. **Decisão (depois dos testes)**
   - Se aprovado → continuar implementação
   - Se não aprovado → avaliar alternativa

---

## 💡 Conclusão

**Stripe Connect** é a melhor escolha para ParkNow porque:

1. ✅ **Gratuito para começar** (sandbox ilimitado)
2. ✅ **Aceita CPF** (não precisa CNPJ inicialmente)
3. ✅ **Split nativo** perfeito para marketplace
4. ✅ **Melhor API** do mercado brasileiro
5. ✅ **PIX integrado** com taxas competitivas (0.99%)
6. ✅ **Segurança e compliance** de nível mundial
7. ✅ **Escalável** (funciona de 10 a 10 milhões de transações)

**Custo total para começar:** R$ 0,00  
**Tempo de implementação:** 4-6 dias  
**ROI esperado:** Imediato (habilita pagamentos online)

---

**Recomendação final:** ⭐⭐⭐⭐⭐ **Stripe Connect**

**Próximo passo:** Criar conta agora → https://dashboard.stripe.com/register
