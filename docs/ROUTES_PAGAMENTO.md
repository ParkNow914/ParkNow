# Mapa de Rotas de Pagamento

Este documento inventaria os arquivos em `routes/` que tratam de pagamento, descreve o papel de cada um e marca o **canônico** para evitar dúvida no futuro. A consolidação física em um único arquivo foi avaliada e descartada porque cada arquivo expõe um conjunto distinto de endpoints já em uso por clientes — refatorar implicaria mudanças de URL públicas. Esta documentação serve como contrato.

## Inventário

| Arquivo | Mount em `routes/index.js` | Status | Descrição |
|---|---|---|---|
| `reservaPagamentoRoutes.js` | `/api/reservas` e `/api/` | ✅ **CANÔNICO (ASAAS)** | Fluxo principal: cria reserva com pagamento ASAAS, retorna QR PIX, recebe webhook ASAAS, consulta status. Aplica `originCheck`, `auditLog` e `idempotency` (Onda 2). |
| `paymentRoutes.js` | `/api/payments` | ✅ ativo | Pagamentos genéricos (cartão de crédito tokenizado via gateway). Protegido por `protectUser` + `checkPaymentModule` (ENABLE_PAYMENT_MODULE). |
| `pixPaymentRoutes.js` | `/api/api` (sic) | ⚠️ legado | Notificação manual de PIX e confirmação de pagamento. Mantido por compatibilidade com clientes antigos; novos clientes devem usar `reservaPagamentoRoutes`. |
| `pagamentoRoutes.js` | `/api/pix` | ⚠️ legado | Endpoints PIX antigos. Encaminha para `reservaPagamentoController`. Considerar deprecation header. |
| `estacionamentoPaymentRoutes.js` | `/api/estacionamento-payments` | ✅ ativo | Configuração de pagamento por estacionamento (vista do dono). |
| `estacionamentoPaymentConfigRoutes.js` | `/api/estacionamento-payment-config` | ⚠️ **duplicado parcial** | Sobreposição parcial com `estacionamentoPaymentRoutes.js`. Candidato a consolidação na Onda 4. |
| `estacionamentoAsaasRoutes.js` | `/api/admin/estacionamentos` (via `adminApiRoutes`) | ✅ ativo | Conecta/desconecta conta ASAAS do estacionamento. Acesso restrito a admin. |
| `webhookRoutes.js` | — | ❌ **REMOVIDO na Onda 3** | Não estava sendo require'd; substituído por `webhookRoutesNew.js` na Onda 2. |
| `webhookRoutesNew.js` | `/api/webhook` | ✅ ativo | Endpoints de teste e captura de webhooks PIX/payments genéricos. Audita via `auditLog`. |

## Webhook canônico

**`POST /api/webhooks/asaas`** (servido por `reservaPagamentoRoutes`) é o único webhook autenticado da aplicação. Ele exige:

- header `asaas-access-token` ↔ `ASAAS_WEBHOOK_SECRET` (constant-time compare, ver `middleware/asaasWebhookAuth.js`)
- comparação validada por `tests/unit/asaasWebhookAuth.test.js`

`POST /api/webhook/pix` e `POST /api/webhook/payments` (em `webhookRoutesNew.js`) **não** são autenticados e devem ser tratados como endpoints de diagnóstico/legado. Não conecte novos provedores neles.

## Plano de consolidação (futuro)

Sem mudar URLs públicas:

1. Unificar `estacionamentoPaymentRoutes` + `estacionamentoPaymentConfigRoutes` montando ambos em um único router compartilhado — mantém os dois prefixos.
2. Marcar handlers em `pixPaymentRoutes` e `pagamentoRoutes` com header de resposta `Deprecation: true` (RFC 8594), expor janela de remoção.
3. Mover toda a documentação OpenAPI para os arquivos canônicos; legados apenas referenciam.
