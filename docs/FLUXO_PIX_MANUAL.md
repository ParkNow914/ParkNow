# 🚗 Fluxo de Reserva + Pagamento PIX Manual (Always Free)

O ParkNow opera **100% sem gateway pago**. O recebimento é direto na chave
PIX do estacionamento, com **confirmação manual** pelo admin via painel.

| | |
|---|---|
| Custo de transação | **R$ 0** (sem gateway intermediário) |
| Confirmação | Manual, pelo admin (validando comprovante) |
| QR Code PIX | Gerado **localmente** (`utils/pixBrCode.js`), padrão Bacen EMV |
| Tempo de aprovação | Depende do admin (típico 1–5 min após o comprovante) |
| Estorno | Manual / por fora — admin contata o cliente |

---

## 🔄 Fluxo End-to-End

```
[Usuário]                                [Backend]                          [Admin]
   |                                         |                                |
   | POST /api/reservas/com-pagamento        |                                |
   |---------------------------------------->|                                |
   |                                         | 1. Cria reserva (status        |
   |                                         |    'pendente_pagamento')       |
   |                                         | 2. Gera BR Code PIX local      |
   |                                         |    (chave do estacionamento)   |
   |                                         | 3. Cria pagamento 'pendente'   |
   | <-- 201 { qr_code, qr_code_base64, … }  |                                |
   |                                         |                                |
   | (paga PIX no app do banco)              |                                |
   |                                         |                                |
   | POST /api/reservas/:id/comprovante      |                                |
   | (multipart: comprovante=foto.jpg)       |                                |
   |---------------------------------------->|                                |
   |                                         | Salva foto em /uploads,        |
   |                                         | grava `comprovante_url`,       |
   |                                         | dispara socket 'comprovante_   |
   |                                         |  pix_recebido' para admins.    |
   | <-- 200 "Aguardando confirmação"        |                                |
   |                                         |                                |
   |                                         |   GET /api/admin/pagamentos/   |
   |                                         |       aguardando-confirmacao   |
   |                                         | <----------------------------- |
   |                                         | (lista pendentes)              |
   |                                         | -----------------------------> |
   |                                         |                                |
   |                                         |   POST /api/admin/reservas/:id |
   |                                         |       /confirmar-pagamento     |
   |                                         | <----------------------------- |
   |                                         | 1. pagamento → 'aprovado'      |
   |                                         | 2. reserva → 'confirmada'      |
   |                                         | 3. vaga → 'ocupada'            |
   |                                         | 4. socket notifica usuário     |
   |  socket 'pagamento_confirmado' <--------|                                |
   |                                         |                                |
```

---

## 📡 Endpoints

### Usuário (motorista)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/reservas/com-pagamento` | Cria reserva + gera PIX BR Code |
| `GET`  | `/api/reservas/:id/pix` | Reexibe o PIX (copia-e-cola + QR base64) |
| `POST` | `/api/reservas/:id/comprovante` | Anexa comprovante (multipart `comprovante=...`) |
| `GET`  | `/api/admin/pagamentos/:id/comprovante` | Entrega o arquivo do comprovante ao admin do estacionamento (comprovantes **não** são servidos estaticamente de `/uploads` — contêm dados financeiros) |
| `GET`  | `/api/pagamentos/:id/status` | Consulta status atual (pendente / aprovado / cancelado) |
| `POST` | `/api/pagamentos/:id/novo-qrcode` | Regenera o PIX se o anterior expirou |
| `DELETE` | `/api/reservas/:id/cancelar` | Cancela reserva (libera vaga; marca pagamento como cancelado) |

### Admin (dono de estacionamento)

| Método | Rota | Descrição |
|---|---|---|
| `GET`  | `/api/admin/pagamentos/aguardando-confirmacao` | Fila de pagamentos pendentes do estacionamento do admin |
| `POST` | `/api/admin/reservas/:id/confirmar-pagamento` | Confirma manualmente (paga reserva + ocupa vaga) |
| `POST` | `/api/admin/reservas/:id/rejeitar-pagamento` | Rejeita (body: `{ motivo: "..." }`) |

Todas as rotas `/api/admin/*` exigem JWT de admin e validam ownership do estacionamento (defesa contra **BOLA**).

---

## 🗄 Estrutura do Banco

Tabela `pagamentos` agora inclui:

| Coluna | Tipo | Função |
|---|---|---|
| `comprovante_url`         | VARCHAR(500) | Caminho do comprovante anexado pelo usuário |
| `comprovante_enviado_em`  | TIMESTAMPTZ  | Quando o usuário avisou que pagou |
| `confirmado_em`           | TIMESTAMPTZ  | Quando o admin confirmou |
| `confirmado_por_admin_id` | INTEGER (FK) | Qual admin confirmou (auditoria) |
| `rejeitado_em`            | TIMESTAMPTZ  | Quando admin rejeitou |
| `motivo_rejeicao`         | TEXT         | Motivo (visível pro usuário) |

Migration: `migrations/20260525_add_comprovante_pix_manual.sql`.

Índice parcial acelera o "aguardando confirmação" do painel:

```sql
CREATE INDEX idx_pagamentos_aguardando_confirmacao
    ON pagamentos (comprovante_enviado_em)
 WHERE confirmado_em IS NULL
   AND rejeitado_em IS NULL
   AND comprovante_url IS NOT NULL;
```

---

## 🔐 Geração local do BR Code (utils/pixBrCode.js)

Implementação inline do padrão EMV/Bacen. Sem chamadas externas:

- TLV (Tag-Length-Value) com campos 00, 26, 52, 53, 54, 58, 59, 60, 62, 63
- CRC16-CCITT-FALSE (polinômio 0x1021, init 0xFFFF) calculado no final
- Normalização ASCII (remove acentos, força maiúsculas)
- QR Code renderizado pela lib `qrcode` (já no `package.json`)

Cobertura: `tests/unit/pixBrCode.test.js`.

---

## ⏰ Tarefas agendadas (`services/cronJobs.js`)

- **expireUnusedReservas** (a cada 5 min): cancela reservas pendentes sem entrada.
- **cancelarReservasPixExpiradas** (a cada 5 min): cancela reservas PIX cujo
  comprovante nunca foi enviado dentro de `PIX_PENDING_TIMEOUT_MIN` minutos.
- **updateAllTemposEstacionados** (a cada 1 min): atualiza tempo estacionado.

---

## ⚖️ Status do Pagamento

| Status | Quando ocorre |
|---|---|
| `pendente` | Reserva criada, aguardando o usuário pagar e/ou anexar comprovante |
| `aprovado` | Admin confirmou manualmente — reserva passa a `confirmada`, vaga a `ocupada` |
| `cancelado` | Cancelamento (usuário, admin ou cron) — vaga liberada |
| `expirado` | Cron cancelou por não pagar no prazo |
| `estorno_manual_pendente` | Pagamento aprovado precisa ser estornado por fora (admin contata o cliente) |

---

## ✅ Vantagens e Limitações

### ✅ Vantagens
- **Zero custo de transação** (vs ~R$ 1 por PIX em gateways pagos)
- **Sem dependência de terceiros** (não acaba quando a API do gateway cai)
- **Privacidade**: dados do pagador não saem do seu servidor
- **Pronto para qualquer chave PIX** (CPF, CNPJ, email, telefone, aleatória)

### ⚠️ Limitações
- **Confirmação não é instantânea** — depende do admin
- **Anti-fraude manual** — o admin precisa validar o comprovante
- **Sem reconciliação automática** — para volumes altos vale considerar
  Pix-Aut ou Webhooks do banco do estacionamento (alguns bancos oferecem free)

Para volumes acima de ~500 transações/dia, considere upgrade para um banco
parceiro com webhook PIX nativo (Inter, BB, Sicoob têm planos free para PJ).
