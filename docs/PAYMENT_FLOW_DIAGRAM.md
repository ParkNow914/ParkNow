# Diagramas de Fluxo - Sistema de Pagamento ParkNow

> ⚠️ **Documento histórico** (pré-migração para o fluxo PIX manual always-free).
> Partes deste documento descrevem fluxos removidos (gateway/webhooks/link de
> confirmação por e-mail). A referência atual é `ARQUITETURA_SISTEMA.md` e
> `docs/FLUXO_PIX_MANUAL.md`.


## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Frontend)                      │
│  - Interface de Reserva                                         │
│  - Display de QR Code PIX                                       │
│  - Formulário de Cartão                                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS (JWT Auth)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API REST (Express.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  Routes:                                                        │
│  ├─ /api/reservas/com-pagamento                                │
│  ├─ /api/pagamentos/:id/status                                 │
│  ├─ /api/payments/webhook/:provedor                            │
│  └─ /api/reservas/:id/notificar-pix                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONTROLLERS                                │
├─────────────────────────────────────────────────────────────────┤
│  ├─ reservaPagamentoController                                 │
│  ├─ paymentController                                          │
│  ├─ pixPaymentController                                       │
│  └─ webhookController                                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVICES                                  │
├─────────────────────────────────────────────────────────────────┤
│  ├─ reservaService                                             │
│  ├─ estacionamentoPaymentProcessingService                     │
│  ├─ notificationService                                        │
│  ├─ emailService                                               │
│  └─ pixExpirationService                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MODELS                                   │
├─────────────────────────────────────────────────────────────────┤
│  ├─ pagamentoModel                                             │
│  ├─ reservaModel                                               │
│  └─ estacionamentoModel                                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                           │
├─────────────────────────────────────────────────────────────────┤
│  Tables:                                                        │
│  ├─ pagamentos (payments records)                              │
│  ├─ reservas (bookings)                                        │
│  ├─ estacionamento_pagamentos (parking payment config)         │
│  └─ notificacoes (notifications)                               │
└─────────────────────────────────────────────────────────────────┘

                    INTEGRAÇÕES EXTERNAS
                    
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Socket.IO       │  │  Email (SMTP)    │  │  PIX (Banco)     │
│  (Real-time)     │  │  (Nodemailer)    │  │  (Webhook)       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. Fluxo Completo de Pagamento PIX (Detalhado)

```
USUÁRIO                API                    SERVICES              MODELS               DATABASE              ESTACIONAMENTO
  │                    │                         │                    │                     │                        │
  │  1. Criar Reserva  │                         │                    │                     │                        │
  ├───────────────────►│                         │                    │                     │                        │
  │  POST /api/reservas│                         │                    │                     │                        │
  │  /com-pagamento    │                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  2. Validar Dados       │                    │                     │                        │
  │                    ├────────────────────────►│                    │                     │                        │
  │                    │  reservaService.criar   │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  3. BEGIN TRANSACTION                    │                        │
  │                    │                         ├───────────────────────────────────────►  │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  4. Criar Reserva  │                     │                        │
  │                    │                         ├───────────────────►│  INSERT reserva     │                        │
  │                    │                         │                    ├────────────────────►│                        │
  │                    │                         │                    │   reserva_id: 123   │                        │
  │                    │                         │                    │◄────────────────────┤                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  5. Processar Pag. │                     │                        │
  │                    │                         ├───────────────────►│                     │                        │
  │                    │                         │  paymentProcessing │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  6. Buscar Config PIX                    │                        │
  │                    │                         ├──────────────────────────────────────────►                        │
  │                    │                         │  SELECT estacionamento_pagamentos        │                        │
  │                    │                         │◄──────────────────────────────────────────                        │
  │                    │                         │  chave_pix, nome_titular, banco          │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  7. Gerar QR Code  │                     │                        │
  │                    │                         │  (pix-payload lib) │                     │                        │
  │                    │                         │  ┌─────────────────┐                     │                        │
  │                    │                         │  │ • Normalizar    │                     │                        │
  │                    │                         │  │   nome/cidade   │                     │                        │
  │                    │                         │  │ • Gerar payload │                     │                        │
  │                    │                         │  │   EMV (BR Code) │                     │                        │
  │                    │                         │  │ • QRCode base64 │                     │                        │
  │                    │                         │  └─────────────────┘                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  8. Criar Pagamento│                     │                        │
  │                    │                         ├───────────────────►│  INSERT pagamento   │                        │
  │                    │                         │                    ├────────────────────►│                        │
  │                    │                         │                    │  id: 456            │                        │
  │                    │                         │                    │  status: pendente   │                        │
  │                    │                         │                    │  qr_code: ...       │                        │
  │                    │                         │                    │◄────────────────────┤                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │  9. COMMIT TRANSACTION                   │                        │
  │                    │                         ├───────────────────────────────────────►  │                        │
  │                    │                         │                    │                     │                        │
  │                    │  10. Retornar Dados     │                    │                     │                        │
  │                    │◄────────────────────────┤                    │                     │                        │
  │                    │  {reserva, pagamento,   │                    │                     │                        │
  │                    │   qr_code, qr_code_text}│                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │  11. Response      │                         │                    │                     │                        │
  │◄───────────────────┤                         │                    │                     │                        │
  │  QR Code + Dados   │                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │  ┌──────────────┐  │                         │                    │                     │                        │
  │  │ Cliente      │  │                         │                    │                     │                        │
  │  │ escaneia QR  │  │                         │                    │                     │                        │
  │  │ no app banco │  │                         │                    │                     │                        │
  │  └──────────────┘  │                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │  ┌──────────────┐  │                         │                    │                     │                        │
  │  │ Cliente      │  │                         │                    │                     │                        │
  │  │ realiza pag. │  │                         │                    │                     │                        │
  │  │ no banco     │  │                         │                    │                     │                        │
  │  └──────────────┘  │                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │  12. Notificar Pag.│                         │                    │                     │                        │
  ├───────────────────►│                         │                    │                     │                        │
  │  POST /notificar-  │                         │                    │                     │                        │
  │  pix               │                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  13. Atualizar Status   │                    │                     │                        │
  │                    ├────────────────────────────────────────────►  │                     │                        │
  │                    │  UPDATE reserva         │                    │  status_pagamento   │                        │
  │                    │  status='aguardando'    │                    │  = 'aguardando_     │                        │
  │                    │                         │                    │  confirmacao'       │                        │
  │                    │                         │                    │◄────────────────────┤                        │
  │                    │                         │                    │                     │                        │
  │                    │  14. Gerar Tokens       │                    │                     │                        │
  │                    │  (confirm/cancel)       │                    │                     │                        │
  │                    │  ┌─────────────────┐    │                    │                     │                        │
  │                    │  │ HMAC SHA-256    │    │                    │                     │                        │
  │                    │  │ reservaId+action│    │                    │                     │                        │
  │                    │  │ +timestamp      │    │                    │                     │                        │
  │                    │  └─────────────────┘    │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  15. Enviar Email       │                    │                     │                        │
  │                    ├────────────────────────────────────────────────────────────────────────────────────────────►│
  │                    │  (emailService)         │                    │                     │                        │
  │                    │  Para: estacionamento   │                    │                     │   ┌──────────────────┐ │
  │                    │  Links:                 │                    │                     │   │ Email com:       │ │
  │                    │  - Confirmar (token)    │                    │                     │   │ • Dados cliente  │ │
  │                    │  - Cancelar (token)     │                    │                     │   │ • Valor          │ │
  │                    │                         │                    │                     │   │ • Link Confirmar │ │
  │                    │                         │                    │                     │   │ • Link Cancelar  │ │
  │                    │                         │                    │                     │   └──────────────────┘ │
  │                    │                         │                    │                     │                        │
  │                    │  16. Socket.IO Event    │                    │                     │                        │
  │                    ├────────────────────────────────────────────────────────────────────────────────────────────►│
  │                    │  emit('pagamento_       │                    │                     │   (Real-time)          │
  │                    │  pendente')             │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │  17. Response OK   │                         │                    │                     │                        │
  │◄───────────────────┤                         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │                         │                    │                     │   18. Admin Clica      │
  │                    │                         │                    │                     │       "Confirmar"      │
  │                    │  19. Confirmar Pagamento│                    │                     │◄───────────────────────┤
  │                    │◄────────────────────────────────────────────────────────────────────────────────────────────┤
  │                    │  GET /confirmar-pag?    │                    │                     │                        │
  │                    │  token=XXX              │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  20. Validar Token      │                    │                     │                        │
  │                    │  (máx 30 min)           │                    │                     │                        │
  │                    │  ✓ Token válido         │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  21. Atualizar Pag.     │                    │                     │                        │
  │                    ├────────────────────────────────────────────►  │  UPDATE pagamento   │                        │
  │                    │                         │                    ├────────────────────►│                        │
  │                    │                         │                    │  status='aprovado'  │                        │
  │                    │                         │                    │  data_pagamento=NOW │                        │
  │                    │                         │                    │◄────────────────────┤                        │
  │                    │                         │                    │                     │                        │
  │                    │  22. Confirmar Reserva  │                    │                     │                        │
  │                    ├────────────────────────────────────────────►  │  UPDATE reserva     │                        │
  │                    │                         │                    ├────────────────────►│                        │
  │                    │                         │                    │  status='confirmada'│                        │
  │                    │                         │                    │  status_pag='pago'  │                        │
  │                    │                         │                    │◄────────────────────┤                        │
  │                    │                         │                    │                     │                        │
  │  23. Email Confirm │                         │                    │                     │                        │
  │◄───────────────────┤  24. Enviar Email       │                    │                     │                        │
  │  "Pagamento OK"    │◄────────────────────────┤                    │                     │                        │
  │                    │  (emailService)         │                    │                     │                        │
  │                    │  Para: cliente          │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  25. Socket.IO Event    │                    │                     │                        │
  ├◄───────────────────┤◄────────────────────────┤                    │                     │                        │
  │  Real-time Update  │  emit('pagamento_       │                    │                     │                        │
  │  "Confirmado!"     │  confirmado')           │                    │                     │                        │
  │                    │                         │                    │                     │                        │
  │                    │  26. Redirect Admin     │                    │                     │                        │
  │                    ├────────────────────────────────────────────────────────────────────────────────────────────►│
  │                    │  /admin/reservas/123    │                    │                     │   Dashboard atualizado │
  │                    │  ?status=confirmado     │                    │                     │                        │
```

---

## 3. Fluxo de Expiração Automática de Pagamentos

```
CRON JOB                      API                        DATABASE                    CLIENTE
(node-cron)                                                                          
  │                             │                            │                         │
  │  A cada 5 minutos           │                            │                         │
  ├────────────────────────────►│                            │                         │
  │  Executar verificação       │                            │                         │
  │                             │                            │                         │
  │                             │  1. Buscar Expiradas       │                         │
  │                             ├───────────────────────────►│                         │
  │                             │  SELECT reservas           │                         │
  │                             │  WHERE status_pagamento    │                         │
  │                             │    = 'aguardando_confirm'  │                         │
  │                             │  AND data_notificacao_pix  │                         │
  │                             │    < (NOW() - 30 min)      │                         │
  │                             │                            │                         │
  │                             │  2. Resultado              │                         │
  │                             │◄───────────────────────────┤                         │
  │                             │  reservas_expiradas[]      │                         │
  │                             │                            │                         │
  │                             │  Para cada reserva:        │                         │
  │                             │  ┌──────────────────────┐  │                         │
  │                             │  │ 3. BEGIN TRANSACTION │  │                         │
  │                             │  └──────────────────────┘  │                         │
  │                             ├───────────────────────────►│                         │
  │                             │                            │                         │
  │                             │  4. Cancelar Reserva       │                         │
  │                             ├───────────────────────────►│                         │
  │                             │  UPDATE reservas           │                         │
  │                             │  SET status='cancelada',   │                         │
  │                             │      status_pagamento=     │                         │
  │                             │        'expirado',         │                         │
  │                             │      motivo='Pag. não      │                         │
  │                             │        confirmado'         │                         │
  │                             │                            │                         │
  │                             │  5. Liberar Vaga           │                         │
  │                             ├───────────────────────────►│                         │
  │                             │  UPDATE vagas              │                         │
  │                             │  SET status='disponivel'   │                         │
  │                             │  WHERE id = vaga_id        │                         │
  │                             │                            │                         │
  │                             │  6. Criar Notificação      │                         │
  │                             ├───────────────────────────►│                         │
  │                             │  INSERT notificacoes       │                         │
  │                             │  tipo='reserva_expirada'   │                         │
  │                             │                            │                         │
  │                             │  7. COMMIT                 │                         │
  │                             ├───────────────────────────►│                         │
  │                             │                            │                         │
  │                             │  8. Enviar Email           │                         │
  │                             ├────────────────────────────────────────────────────►  │
  │                             │  "Reserva Cancelada"       │                         │
  │                             │  Motivo: Pagamento não     │                         │
  │                             │  confirmado em 30 min      │                         │
  │                             │                            │                         │
  │                             │  9. Socket.IO Event        │                         │
  │                             ├────────────────────────────────────────────────────►  │
  │                             │  emit('reserva_expirada')  │                         │
  │                             │  {reservaId, mensagem}     │                         │
  │                             │                            │                         │
  │  10. Log Processamento      │                            │                         │
  │◄────────────────────────────┤                            │                         │
  │  "5 reservas expiradas"     │                            │                         │
  │                             │                            │                         │
```

---

## 4. Fluxo de Webhook (Pagamento Automático)

```
BANCO/GATEWAY           API                      MODELS               DATABASE             CLIENTE
  │                      │                         │                     │                    │
  │  1. PIX Recebido     │                         │                     │                    │
  │  no Estacionamento   │                         │                     │                    │
  │                      │                         │                     │                    │
  │  2. Webhook POST     │                         │                     │                    │
  ├─────────────────────►│                         │                     │                    │
  │  /api/payments/      │                         │                     │                    │
  │  webhook/pix         │                         │                     │                    │
  │  Headers:            │                         │                     │                    │
  │  X-Signature: xxx    │                         │                     │                    │
  │  Body:               │                         │                     │                    │
  │  {                   │                         │                     │                    │
  │    pix: [{           │                         │                     │                    │
  │      txid: "...",    │                         │                     │                    │
  │      valor: 20.0     │                         │                     │                    │
  │    }]                │                         │                     │                    │
  │  }                   │                         │                     │                    │
  │                      │                         │                     │                    │
  │                      │  3. Validar Assinatura  │                     │                    │
  │                      │  ┌──────────────────┐   │                     │                    │
  │                      │  │ HMAC SHA-256     │   │                     │                    │
  │                      │  │ usando SECRET    │   │                     │                    │
  │                      │  │ do .env          │   │                     │                    │
  │                      │  └──────────────────┘   │                     │                    │
  │                      │  ✓ Assinatura válida    │                     │                    │
  │                      │                         │                     │                    │
  │                      │  4. Buscar Pagamento    │                     │                    │
  │                      ├────────────────────────►│                     │                    │
  │                      │  por txid               │  SELECT pagamentos  │                    │
  │                      │                         ├────────────────────►│                    │
  │                      │                         │  WHERE dados_retorno│                    │
  │                      │                         │  ->>'txid' = 'xxx'  │                    │
  │                      │                         │◄────────────────────┤                    │
  │                      │                         │  pagamento {id:456} │                    │
  │                      │                         │                     │                    │
  │                      │  5. Atualizar Status    │                     │                    │
  │                      ├────────────────────────►│                     │                    │
  │                      │  status='aprovado'      │  UPDATE pagamentos  │                    │
  │                      │                         ├────────────────────►│                    │
  │                      │                         │  SET status='aprov',│                    │
  │                      │                         │  data_pagamento=NOW │                    │
  │                      │                         │◄────────────────────┤                    │
  │                      │                         │                     │                    │
  │                      │  6. Buscar Reserva      │                     │                    │
  │                      ├────────────────────────►│                     │                    │
  │                      │                         │  SELECT reservas    │                    │
  │                      │                         ├────────────────────►│                    │
  │                      │                         │  WHERE id=reserva_id│                    │
  │                      │                         │◄────────────────────┤                    │
  │                      │                         │                     │                    │
  │                      │  7. Confirmar Reserva   │                     │                    │
  │                      ├────────────────────────►│                     │                    │
  │                      │                         │  UPDATE reservas    │                    │
  │                      │                         ├────────────────────►│                    │
  │                      │                         │  SET status=        │                    │
  │                      │                         │    'confirmada',    │                    │
  │                      │                         │  status_pagamento=  │                    │
  │                      │                         │    'pago'           │                    │
  │                      │                         │◄────────────────────┤                    │
  │                      │                         │                     │                    │
  │                      │  8. Notificar Cliente   │                     │                    │
  │                      ├─────────────────────────────────────────────────────────────────► │
  │                      │  Email + Socket.IO      │                     │                    │
  │                      │  "Pagamento Confirmado" │                     │  ┌──────────────┐  │
  │                      │                         │                     │  │ Notificação  │  │
  │                      │                         │                     │  │ em tempo real│  │
  │                      │                         │                     │  └──────────────┘  │
  │                      │                         │                     │                    │
  │  9. Response 200 OK  │                         │                     │                    │
  │◄─────────────────────┤                         │                     │                    │
  │  {success: true}     │                         │                     │                    │
  │                      │                         │                     │                    │
```

---

## 5. Fluxo de Estados do Pagamento (State Machine)

```
                           ┌──────────────┐
                           │   INICIAL    │
                           │ (não existe) │
                           └──────┬───────┘
                                  │
                  Criar Pagamento │
                                  ▼
                           ┌──────────────┐
                      ┌───►│   PENDENTE   │◄────┐
                      │    └──────┬───────┘     │
                      │           │             │
                      │           │             │
           Timeout    │           │             │ Tentar novamente
           (30 min)   │           │             │ (regenerar QR)
                      │           │             │
                      │           │             │
                      │           ▼             │
                      │    ┌──────────────┐     │
                      │    │  APROVADO    │     │
                      │    └──────┬───────┘     │
                      │           │             │
                      │           │             │
                      │           │ Estorno     │
                      │           ▼             │
                      │    ┌──────────────┐     │
                      │    │ REEMBOLSADO  │     │
                      │    └──────────────┘     │
                      │                         │
                      │                         │
                      ▼                         │
               ┌──────────────┐                 │
               │   CANCELADO  │                 │
               └──────────────┘                 │
                      ▲                         │
                      │                         │
                      │ Recusa Gateway          │
                      │                         │
                      │                         │
               ┌──────────────┐                 │
               │   RECUSADO   │─────────────────┘
               └──────────────┘
                      ▲
                      │
                      │ Validação falhou
                      │ (dados inválidos)
                      │
                      │
```

### Transições de Estado:

| Estado Atual | Evento | Estado Final | Descrição |
|-------------|--------|--------------|-----------|
| (nenhum) | Criar Pagamento | PENDENTE | Pagamento criado, aguardando confirmação |
| PENDENTE | Confirmar | APROVADO | Pagamento confirmado manualmente ou por webhook |
| PENDENTE | Timeout (30 min) | CANCELADO | Expiração automática |
| PENDENTE | Cancelar | CANCELADO | Cancelamento manual pelo usuário |
| PENDENTE | Recusar | RECUSADO | Gateway recusou o pagamento |
| APROVADO | Estornar | REEMBOLSADO | Reembolso processado |
| RECUSADO | Tentar Novamente | PENDENTE | Nova tentativa com outro método |
| CANCELADO | Tentar Novamente | PENDENTE | Nova tentativa de pagamento |

---

## 6. Fluxo de Integração com Gateway de Cartão (Futuro)

```
CLIENTE              API                 GATEWAY               DATABASE
  │                   │                  (Stripe)                │
  │  1. Pagar com     │                     │                    │
  │  Cartão           │                     │                    │
  ├──────────────────►│                     │                    │
  │  POST /reservas/  │                     │                    │
  │  com-pagamento    │                     │                    │
  │  {                │                     │                    │
  │    metodo: "cc",  │                     │                    │
  │    card: {        │                     │                    │
  │      number,      │                     │                    │
  │      cvv, ...     │                     │                    │
  │    }              │                     │                    │
  │  }                │                     │                    │
  │                   │                     │                    │
  │                   │  2. Validar Cartão  │                    │
  │                   │  ┌──────────────┐   │                    │
  │                   │  │ Luhn Check   │   │                    │
  │                   │  │ Data válida  │   │                    │
  │                   │  │ CVV válido   │   │                    │
  │                   │  └──────────────┘   │                    │
  │                   │  ✓ Cartão OK        │                    │
  │                   │                     │                    │
  │                   │  3. Criar Token     │                    │
  │                   ├────────────────────►│                    │
  │                   │  POST /tokens       │                    │
  │                   │  {card_data}        │                    │
  │                   │                     │                    │
  │                   │  4. Token           │                    │
  │                   │◄────────────────────┤                    │
  │                   │  {token: "tok_xxx"} │                    │
  │                   │                     │                    │
  │                   │  5. Processar Pag.  │                    │
  │                   ├────────────────────►│                    │
  │                   │  POST /charges      │                    │
  │                   │  {                  │                    │
  │                   │    amount: 2000,    │                    │
  │                   │    token: "tok_xxx",│                    │
  │                   │    currency: "brl"  │                    │
  │                   │  }                  │                    │
  │                   │                     │                    │
  │                   │     (Processando)   │                    │
  │                   │  ┌──────────────┐   │                    │
  │                   │  │ 3D Secure?   │   │                    │
  │                   │  │ Validar CVV  │   │                    │
  │                   │  │ Saldo OK?    │   │                    │
  │                   │  └──────────────┘   │                    │
  │                   │                     │                    │
  │                   │  6. Resultado       │                    │
  │                   │◄────────────────────┤                    │
  │                   │  {                  │                    │
  │                   │    status: "succ",  │                    │
  │                   │    charge_id: "..." │                    │
  │                   │  }                  │                    │
  │                   │                     │                    │
  │                   │  7. Salvar Pagamento│                    │
  │                   ├────────────────────────────────────────► │
  │                   │  INSERT pagamentos  │                    │
  │                   │  SET status='aprov',│                    │
  │                   │      transacao_id   │                    │
  │                   │                     │                    │
  │                   │  8. Confirmar Res.  │                    │
  │                   ├────────────────────────────────────────► │
  │                   │  UPDATE reservas    │                    │
  │                   │                     │                    │
  │  9. Response      │                     │                    │
  │◄──────────────────┤                     │                    │
  │  {                │                     │                    │
  │    success: true, │                     │                    │
  │    pagamento_id,  │                     │                    │
  │    reserva_id     │                     │                    │
  │  }                │                     │                    │
  │                   │                     │                    │
```

---

## 7. Fluxo de Dados - Tabelas do Banco de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                          RESERVAS                               │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ usuario_id (FK → usuarios.id)                                  │
│ estacionamento_id (FK → estacionamentos.id)                    │
│ vaga_id (FK → vagas.id)                                        │
│ id_pagamento (FK → pagamentos.id)                              │
│ status ('pendente', 'confirmada', 'cancelada', 'ativa', ...)   │
│ status_pagamento ('pendente', 'pago', 'cancelado', ...)        │
│ data_entrada_prevista                                           │
│ data_saida_prevista                                             │
│ valor_total                                                     │
│ placa_veiculo                                                   │
│ created_at, updated_at                                          │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ 1:1
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PAGAMENTOS                              │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ reserva_id (FK → reservas.id) UNIQUE                           │
│ metodo_pagamento ('pix', 'cartao_credito', ...)                │
│ valor                                                           │
│ status ('pendente', 'aprovado', 'recusado', ...)               │
│ dados_retorno (JSONB)                                           │
│   ├─ qr_code (base64 do QR Code PIX)                           │
│   ├─ qr_code_text (código copia e cola)                        │
│   ├─ chave_pix                                                  │
│   ├─ nome_titular                                               │
│   ├─ txid (ID da transação PIX)                                │
│   ├─ expira_em                                                  │
│   └─ transacao_id (ID do gateway de cartão)                    │
│ id_estacionamento (FK → estacionamentos.id)                    │
│ id_usuario (FK → usuarios.id)                                  │
│ created_at, updated_at                                          │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ N:1
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ESTACIONAMENTO_PAGAMENTOS                     │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ estacionamento_id (FK → estacionamentos.id) UNIQUE             │
│ tipo_chave_pix ('CPF', 'CNPJ', 'EMAIL', ...)                   │
│ chave_pix (valor da chave)                                     │
│ nome_titular                                                    │
│ banco (opcional)                                                │
│ tipo_conta ('CONTA_CORRENTE', 'CONTA_POUPANCA', ...)          │
│ agencia (opcional)                                              │
│ conta (opcional)                                                │
│ data_criacao, data_atualizacao                                  │
└─────────────────────────────────────────────────────────────────┘

         RELACIONAMENTOS

┌────────────┐        ┌────────────┐        ┌──────────────────┐
│  USUARIOS  │───────►│  RESERVAS  │───────►│   PAGAMENTOS     │
└────────────┘  1:N   └────────────┘  1:1   └──────────────────┘
                            │
                            │ N:1
                            ▼
                      ┌─────────────────┐
                      │ ESTACIONAMENTOS │
                      └────────┬────────┘
                               │
                               │ 1:1
                               ▼
                      ┌──────────────────────────┐
                      │ ESTACIONAMENTO_PAGAMENTOS│
                      └──────────────────────────┘
```

---

## 8. Fluxo de Notificações

```
EVENTO                    NOTIFICAÇÃO                  CANAL
  │                           │                           │
  │ Pagamento Pendente        │                           │
  ├──────────────────────────►│                           │
  │                           ├──────────────────────────►│ Socket.IO
  │                           │  emit('pagamento_         │ (Real-time)
  │                           │  pendente')               │
  │                           │                           │
  │                           ├──────────────────────────►│ Email
  │                           │  "PIX Copiado"            │ (Async)
  │                           │  Para: Estacionamento     │
  │                           │                           │
  │                           ├──────────────────────────►│ Database
  │                           │  INSERT notificacoes      │ (Persistente)
  │                           │  tipo='pag_pendente'      │
  │                           │                           │
  │                           │                           │
  │ Pagamento Confirmado      │                           │
  ├──────────────────────────►│                           │
  │                           ├──────────────────────────►│ Socket.IO
  │                           │  emit('pagamento_         │
  │                           │  confirmado')             │
  │                           │                           │
  │                           ├──────────────────────────►│ Email
  │                           │  "Pagamento Confirmado"   │
  │                           │  Para: Cliente            │
  │                           │                           │
  │                           ├──────────────────────────►│ Database
  │                           │  INSERT notificacoes      │
  │                           │                           │
  │                           │                           │
  │ Reserva Expirada          │                           │
  ├──────────────────────────►│                           │
  │                           ├──────────────────────────►│ Socket.IO
  │                           │  emit('reserva_           │
  │                           │  expirada')               │
  │                           │                           │
  │                           ├──────────────────────────►│ Email
  │                           │  "Reserva Cancelada"      │
  │                           │  Para: Cliente            │
  │                           │                           │
  │                           ├──────────────────────────►│ Database
  │                           │  INSERT notificacoes      │
  │                           │                           │
```

---

## 9. Resumo de Componentes e Responsabilidades

```
┌───────────────────────────────────────────────────────────────┐
│                      RESPONSABILIDADES                        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  CONTROLLERS (controllers/)                                   │
│  ├─ reservaPagamentoController.js                            │
│  │  └─ Criar reserva com pagamento                           │
│  │     Notificar pagamento PIX                               │
│  │     Consultar status de pagamento                         │
│  │                                                            │
│  ├─ paymentController.js                                     │
│  │  └─ Processar pagamento genérico                          │
│  │     Verificar status                                      │
│  │     Listar meus pagamentos                                │
│  │     Webhook de pagamento                                  │
│  │                                                            │
│  └─ pixPaymentController.js                                  │
│     └─ Confirmar pagamento PIX (admin)                       │
│        Cancelar reserva por falta de pagamento               │
│        Verificar reservas expiradas (cron)                   │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  SERVICES (services/)                                         │
│  ├─ reservaService.js                                        │
│  │  └─ Criar reserva com pagamento (orquestra tudo)          │
│  │     Atualizar status por pagamento                        │
│  │     Obter reserva por pagamento                           │
│  │                                                            │
│  ├─ estacionamentoPaymentProcessingService.js                │
│  │  └─ Processar pagamento (PIX, Cartão, Dinheiro)           │
│  │     Gerar QR Code PIX real                                │
│  │     Validar dados do cartão                               │
│  │     Identificar bandeira                                  │
│  │     Ocultar dados sensíveis                               │
│  │                                                            │
│  ├─ notificationService.js                                   │
│  │  └─ Enviar notificações                                   │
│  │     Criar registros de notificação                        │
│  │                                                            │
│  ├─ emailService.js                                          │
│  │  └─ Enviar emails (PIX copiado, confirmação, cancel.)     │
│  │                                                            │
│  └─ pixExpirationService.js                                  │
│     └─ Verificar e cancelar pagamentos expirados             │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  MODELS (models/)                                             │
│  ├─ pagamentoModel.js                                        │
│  │  └─ CRUD de pagamentos                                    │
│  │     Buscar por ID, reserva, status, método                │
│  │     Atualizar status                                      │
│  │     Listar por usuário                                    │
│  │                                                            │
│  ├─ reservaModel.js                                          │
│  │  └─ CRUD de reservas                                      │
│  │     Calcular valor                                        │
│  │     Atualizar status                                      │
│  │                                                            │
│  └─ estacionamentoModel.js                                   │
│     └─ CRUD de estacionamentos                               │
│        Validar configuração de pagamento                     │
│        Buscar config PIX                                     │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  MIDDLEWARE (middleware/)                                     │
│  └─ validatePixKey.js                                        │
│     └─ Validar formato da chave PIX                          │
│        Verificar CNPJ corresponde                            │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  UTILS (utils/)                                               │
│  ├─ logger.js (Winston)                                      │
│  │  └─ Logs estruturados                                     │
│  │                                                            │
│  ├─ AppError.js                                              │
│  │  └─ Erros customizados                                    │
│  │                                                            │
│  └─ formatters.js                                            │
│     └─ Formatação de valores                                 │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

**Última Atualização:** 2024-11-07  
**Versão do Documento:** 1.0.0  
**Autor:** ParkNow Development Team
