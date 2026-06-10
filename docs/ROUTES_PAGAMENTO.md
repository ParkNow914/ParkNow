# Mapa de Rotas de Pagamento

> Atualizado em 2026-06 para refletir o fluxo **PIX manual always-free**
> (sem gateway). Os routers de webhook/link-de-confirmação da era
> Stripe/ASAAS foram removidos do código.

## Inventário atual

| Arquivo | Mount em `routes/index.js` | Status | Descrição |
|---|---|---|---|
| `reservaPagamentoRoutes.js` | `/api/reservas` e `/api/` | ✅ **CANÔNICO** | Fluxo principal: `POST /api/reservas/com-pagamento` cria a reserva e devolve o BR Code PIX (gerado localmente); `GET /api/pagamentos/:id/status` consulta o status. Aplica `originCheck`, `auditLog` e `idempotency`. |
| `pixManualConfirmacaoRoutes.js` | `/api/admin` (router admin) e `/api` (router de usuário, com `protectUser`) | ✅ ativo | Confirmação manual: usuário envia comprovante (`POST /api/reservas/:id/comprovante`, multipart, rate-limited); admin lista a fila (`GET /api/admin/pagamentos/aguardando-confirmacao`), baixa o comprovante (`GET /api/admin/pagamentos/:id/comprovante` — autenticado, comprovantes não são servidos estaticamente) e confirma/rejeita (`POST /api/admin/reservas/:id/confirmar-pagamento` / `rejeitar-pagamento`). |
| `paymentRoutes.js` | `/api/payments` | ✅ ativo | Consultas genéricas de pagamento do usuário autenticado. |
| `pagamentoRoutes.js` | `/api/pix` | ⚠️ legado (`Deprecation: true`, Sunset 2027-01-01) | Endpoints PIX antigos mantidos por compatibilidade; encaminham para o fluxo canônico. |
| `estacionamentoPaymentRoutes.js` | `/api/estacionamento-payments` | ✅ ativo | Configuração de recebimento (chave PIX) na visão do dono do estacionamento. |
| `estacionamentoPaymentConfigRoutes.js` | `/api/estacionamento-payment-config` | ⚠️ sobreposição parcial | Sobrepõe parte de `estacionamentoPaymentRoutes`; candidato a consolidação (sem mudar URLs públicas). |
| `cronRoutes.js` | `/api/cron` | ✅ ativo | Expiração de reservas/PIX para acionamento externo. Protegido por `CRON_API_KEY` (header `x-api-key`, fail-closed). |

## Removidos (não existem mais no código)

- `pixPaymentRoutes.js` + `pixPaymentController.js` — fluxo antigo de
  confirmação por **link de e-mail** com token HMAC; estava quebrado de ponta a
  ponta (modelo `db.Usuario` inexistente, token nunca validava) e montado num
  caminho bugado `/api/api/...`.
- `webhookRoutesNew.js` + `webhookController.js` + `webhookService.js` +
  `paymentService.js` + `pixService.js` (Gerencianet) — cadeia de webhooks sem
  consumidor real (stubs no-op ou código sem rota). Se um dia houver webhook
  PIX de banco (Inter/Sicoob/BB), implemente novo router com validação de
  assinatura obrigatória.

## Regra para novos clientes

Use SEMPRE `reservaPagamentoRoutes` + `pixManualConfirmacaoRoutes`. Não conecte
nada novo nos routers marcados como legados.
