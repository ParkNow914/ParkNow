# Auditoria técnica completa — ParkNow

**Data:** 20/11/2026 · **Repositório:** `ParkNow914/ParkNow` (branch `main`, commit `21ff811`, 87 commits, 363 arquivos, ~44 mil linhas de JS, 8,2 mil de HTML, 2,9 mil de CSS, 51 migrations SQL)
**Ambiente de prova:** Node 26, PostgreSQL 18 isolado, servidor rodando localmente na porta 3456 com banco criado do zero pelas próprias migrations.

---

## 1. Veredito

**O sistema não está pronto para produção com empresas reais.** A base tem coisas boas (CSP sem `unsafe-inline` em `script-src`, Argon2id para motoristas, checagem de dono na confirmação PIX com `FOR UPDATE`, validação de comprovante por magic bytes, idempotência em Postgres, migrations com checksum, CI gateando deploy, backup criptografado). Mas o **fluxo de dinheiro está quebrado e é manipulável**, o **isolamento entre estacionamentos não existe em várias rotas** e há **segredos reais no histórico público do Git**.

Todos os itens marcados com 🔬 abaixo foram **reproduzidos ao vivo** contra o servidor local, não são suposição.

### As 10 coisas que precisam parar antes de qualquer cliente real

| #   | Problema                                                                                                                                              | Prova |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | O **valor da reserva vem do navegador**. Reserva de R$ 0,01 aceita.                                                                                   | 🔬    |
| 2   | **Todo pagamento é gravado como `NaN` e o QR PIX sai sem valor** (o motorista paga o que quiser).                                                     | 🔬    |
| 3   | Reserva **sobrescreve vaga ocupada**, aceita datas no passado e saída antes da entrada.                                                               | 🔬    |
| 4   | **Qualquer dono de estacionamento desativa a conta de qualquer motorista** da plataforma (e a API responde 404 mentindo).                             | 🔬    |
| 5   | Dono de um estacionamento **vê placa, nome e ID de clientes de todos os outros**.                                                                     | 🔬    |
| 6   | `.env` com senha do Gmail, `JWT_SECRET`, senha do banco e token `APP_` do Mercado Pago, mais um **dump do banco**, estão no histórico público do Git. | 🔬    |
| 7   | **Senha do parceiro gravada em texto puro** no banco por 7 dias.                                                                                      | 🔬    |
| 8   | **Login de admin dá erro 500** em banco criado pelas migrations (coluna faltando).                                                                    | 🔬    |
| 9   | Reservas do fluxo principal **nunca expiram**: a vaga fica presa como "reservada" para sempre.                                                        | 🔬    |
| 10  | Refresh token antigo **continua válido depois da rotação** e **qualquer pessoa derruba a sessão de qualquer conta** com um token forjado.             | 🔬    |

### Nota por área (0 a 10)

| Área                           | Nota | Comentário curto                                                      |
| ------------------------------ | ---- | --------------------------------------------------------------------- |
| Segurança de aplicação         | 3    | Boas intenções, mas autorização multi-tenant e sessão falham          |
| Lógica de negócio / pagamentos | 2    | Preço do cliente, PIX sem valor, sem controle de conflito             |
| Dados / banco                  | 4    | Migrations boas; schema duplicado, sem constraints de negócio         |
| Backend / arquitetura          | 4    | 2 ORMs, 4 pools, modelos triplicados, API v2 morta                    |
| Frontend / UX                  | 4    | Landing ok; painel admin com dados falsos; tempo real quebrado        |
| Infra / DevOps                 | 5    | CI/CD e backup existem; Node 18 EOL, cron dormindo, sem trust proxy   |
| Qualidade / testes             | 3    | 20% de cobertura, nada de autorização testado                         |
| Observabilidade                | 6    | health/ready, Prometheus, request-id; falta tracing e alertas reais   |
| LGPD / jurídico                | 1    | Sem política, termos, consentimento, exportação ou exclusão no `main` |
| Produto (smart parking)        | 3    | Reserva + PIX manual; falta automação de pátio, LPR, mensalista       |

---

## 2. Como a auditoria foi feita (e o que ela cobre)

Transparência sobre cobertura, para você saber o peso de cada conclusão:

- **100% das linhas passaram por ferramenta automática:** ESLint (todo JS), Semgrep com 9 rulesets (`p/javascript`, `p/nodejs`, `p/security-audit`, `p/secrets`, `p/dockerfile`, `p/terraform`, Trail of Bits, Kondukto, HashiCorp), gitleaks no **histórico inteiro** (87 commits, todas as branches), Trivy (dependências, IaC e segredos), `npm audit`, `npm outdated`, grafo de dependências entre arquivos (código morto), varredura de SQL montado com interpolação, varredura de sinks de XSS no frontend, Lighthouse (landing e painel), inspeção de schema real no Postgres.
- **Leitura manual linha a linha** dos caminhos críticos: `server.js`, autenticação (rotas, middleware, JWT, controller), sessão/refresh, criação de reserva com PIX, geração do BR Code, envio e confirmação de comprovante, API admin, Socket.IO, uploads, jobs agendados, camada de banco, configuração, Dockerfile, `fly.toml`, workflows do GitHub Actions, Terraform.
- **Testes ao vivo (PoC)** de cada achado crítico/alto, com servidor real e banco criado pelas migrations.
- **Não rodou:** os rulesets `p/express` e `p/yaml` não existem mais no registry do Semgrep (HTTP 404); Semgrep rodou em modo OSS (sem análise entre arquivos); a suíte E2E do Playwright não foi executada; **produção (`parknow-alimi.fly.dev`) não foi tocada** de propósito.
- O restante do frontend (~15 mil linhas de JS inline das páginas) e os templates de e-mail foram cobertos pelas ferramentas acima e por leitura dirigida, não por leitura integral.

### Resultados das ferramentas

| Ferramenta                     | Resultado                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jest (com Postgres real)       | 75 de 76 testes passam. Falha `tests/unit/openapi.test.js` no Windows (glob do swagger-jsdoc com caminho acentuado).                                                                                            |
| Cobertura                      | **20,3% statements, 14,8% branches, 22,8% funções**                                                                                                                                                             |
| ESLint                         | 349 avisos: 135 `no-console`, 111 `no-unused-vars`, **94 `no-undef`** (2 viram erro real em runtime), 9 `no-redeclare`                                                                                          |
| npm audit                      | **40 vulnerabilidades: 2 críticas** (handlebars, proxy-addr), **19 altas** (axios, multer, nodemailer, socket.io-parser, engine.io, ws, sharp, body-parser, undici, zod, form-data, follow-redirects, js-yaml…) |
| Trivy                          | 112 CVEs no `package-lock.json` (3 críticas, 52 altas)                                                                                                                                                          |
| gitleaks                       | 15 achados no histórico, incluindo `.env` real (ver C-06)                                                                                                                                                       |
| Semgrep                        | 15 achados (infra: portas expostas em todas as interfaces nos docker-compose, `sslmode=disable` no monitoring, variável em `href` no template de e-mail, imagem não-distroless)                                 |
| Migrations em banco novo       | 43 aplicadas, 6 marcadas obsoletas; **sobra coluna faltando** (ver C-08)                                                                                                                                        |
| Lighthouse landing (mobile)    | Acessibilidade 91 · Boas práticas 96 · SEO 100                                                                                                                                                                  |
| Lighthouse painel do motorista | Acessibilidade 96 · Boas práticas 100 · SEO 83                                                                                                                                                                  |

---

## 3. Achados críticos (bloqueiam produção)

### C-01 · Preço da reserva definido pelo cliente 🔬

- **Onde:** `controllers/reservaPagamentoController.js:29,57` → `services/reservaService.js:416`
- **O quê:** `POST /api/reservas/com-pagamento` grava `valor_total` com o `valor` enviado no corpo da requisição. Não há cálculo no servidor.
- **Prova:** reserva criada com `"valor": 0.01` → `reservas.valor_total = 0.01`.
- **Impacto:** perda de receita direta; o admin compara o comprovante com um valor falso.
- **Correção:** calcular o preço só no servidor (tabela de preços do estacionamento × duração, com regras de fração/tolerância/diária), ignorar qualquer valor do cliente, gravar o preço calculado e o snapshot da tabela usada.

### C-02 · Pagamento `NaN` e QR PIX sem valor em TODA reserva 🔬

- **Onde:** `services/estacionamentoPaymentProcessingService.js:55` lê `reserva.horario_inicio_reserva` / `reserva.horario_fim_reserva`, colunas que **não existem** (a tabela usa `data_entrada_prevista` / `data_saida_prevista`). `models/reservaModel.js:474` devolve `NaN`; `utils/pixBrCode.js:90` omite o campo 54 (valor) quando não é número positivo.
- **Prova:** reserva legítima (R$ 20, 2 horas, datas futuras) → `pagamentos.valor = NaN`, BR Code decodificado sem o campo `54` (cobrança "valor a definir").
- **Impacto:** o fluxo principal de cobrança não funciona para ninguém; o teste de integração passa porque não confere o valor.
- **Correção:** usar as colunas reais, validar `Number.isFinite(valor) && valor > 0` antes de gerar o PIX (falhar fechado), adicionar `CHECK (valor > 0 AND valor <> 'NaN')` em `pagamentos`, e um teste que decodifica o BR Code e confere o campo 54.

### C-03 · Reserva sobrescreve vaga ocupada, sem conflito nem validação de datas 🔬

- **Onde:** `services/reservaService.js:426-430` (`UPDATE vagas SET status='reservada' WHERE id=$1`, sem `AND status='livre'`, sem conferir se a vaga pertence ao estacionamento).
- **Prova:** vaga `ocupada` virou `reservada`; aceitou entrada em 2020 e saída 5 horas **antes** da entrada.
- **Impacto:** overbooking, carro "desaparece" do controle do pátio, disputa na portaria.
- **Correção:** validar `data_saida > data_entrada > agora`, horário de funcionamento, vaga do mesmo estacionamento; `SELECT … FOR UPDATE` na vaga; e uma **constraint de exclusão** no banco: `EXCLUDE USING gist (vaga_id WITH =, tstzrange(inicio, fim) WITH &&) WHERE (status IN (...ativos))` com `btree_gist`. Assim o próprio banco impede reserva sobreposta mesmo com corrida.

### C-04 · Qualquer dono de estacionamento desativa qualquer motorista 🔬

- **Onde:** `routes/adminApiRoutes.js:117` → `controllers/adminApiController.js:336` (`setUserStatus`, sem nenhum escopo).
- **Prova:** "Admin B", sem estacionamento nenhum, mudou o status do motorista para `inativo`. A API respondeu **404 "Usuário não encontrado"** mas o banco foi alterado.
- **Impacto:** sabotagem de concorrente, bloqueio em massa de clientes, suporte sem conseguir diagnosticar (resposta mentirosa).
- **Correção:** separar papéis: `operador`, `gerente`, `dono` (escopo do estacionamento) e `superadmin ParkNow` (plataforma). Só superadmin altera conta de motorista. Corrigir o retorno de `setUserStatusAdmin`.

### C-05 · Vazamento de dados pessoais entre estacionamentos (LGPD) 🔬

- **Onde:** `controllers/adminApiController.js:39` (`getAllVagas` → `vagaModel.findAllVagasAdmin` sem `admin_id`), `:51` (`getVagasOcupadas`), `:200` (`getVagasByEstacionamentoId`, sem checar dono); `services/socketService.js:131` sala única `admins_geral` recebe `nova_reserva`/`atualizacao_reserva` (linhas 348-379) de **todos** os estacionamentos com a linha completa da reserva.
- **Prova:** Admin B listou 11 vagas de 2 estacionamentos alheios com `placa`, `usuario_nome`, `usuario_id`.
- **Impacto:** incidente de segurança com dado pessoal (placa + nome = dado pessoal pela LGPD), passível de comunicação à ANPD.
- **Correção:** toda query admin com `WHERE e.admin_id = $adminId` (ou Row Level Security no Postgres com `SET app.admin_id`), salas Socket.IO por estacionamento (`estacionamento_<id>_admin`) entradas só após checar dono, e payload mínimo nos eventos.

### C-06 · Segredos e dump do banco no histórico público do Git 🔬

- **Onde:** commits `2b2d2c8`, `492014e`, `17ed8df` (`.env` com `EMAIL_PASS` do Gmail, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `PG_PASSWORD`, `MP_ACCESS_TOKEN=APP_…`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, chave ASAAS sandbox), `scripts/.env`, e `bd/backup_20251111_152349.sql` (commit `89e360d`, 15 tabelas incluindo `usuarios` e `admins` com 4 hashes de senha).
- **Impacto:** se algum desses segredos ainda estiver em uso, qualquer pessoa com o repositório **forja token de admin** (mesmo `JWT_SECRET`), lê o e-mail do sistema e acessa o banco.
- **Correção (nesta ordem):** 1) rotacionar **todos** (senha de app do Gmail, JWTs, banco, Mercado Pago, ASAAS); 2) invalidar sessões; 3) limpar o histórico com `git filter-repo` e forçar push (a exposição já aconteceu, então a rotação é o que protege); 4) ativar Secret Scanning + Push Protection do GitHub (gratuito em repo público) e `gitleaks` no pre-commit.

### C-07 · Senha do parceiro em texto puro no banco 🔬

- **Onde:** `controllers/authController.js:380` guarda `senha` em `parceria_solicitacoes.dados` (JSONB) por 7 dias "para hashear na aprovação".
- **Prova:** `dados->>'senha'` igual à senha digitada.
- **Correção:** hashear (Argon2id) **no cadastro** e guardar só o hash; ou criar o admin já com status `pendente_aprovacao` e senha hasheada. Guardar o token de aprovação também como hash.

### C-08 · Login de admin quebrado em banco novo 🔬

- **Onde:** `admins.refresh_token_hash` só é criada por `scripts/migrations/002_add_refresh_token_to_admins.sql`, pasta que `scripts/migrate.js` não executa.
- **Prova:** `POST /api/auth/admin/login` → 500 `column "refresh_token_hash" of relation "admins" does not exist`.
- **Correção:** mover para `migrations/` com data atual; adicionar ao CI um teste "banco do zero → login admin".

### C-09 · Reservas do fluxo principal nunca expiram 🔬

- **Onde:** o fluxo cria `status='pendente_pagamento'` (`reservaPagamentoController.js:60`); os jobs só olham `RESERVATION_STATUS.PENDING = 'pendente'` (`services/pixExpirationService.js:40`, `services/reservaMaintenanceService.js`). Além disso o código lê `PIX_CONFIRMATION_TIMEOUT_MINUTES` (`pixExpirationService.js:20`) enquanto a documentação e o `.env.example` dizem `PIX_PENDING_TIMEOUT_MIN`.
- **Prova:** reserva com entrada em 2020 continuou `pendente_pagamento` após duas execuções do cron.
- **Impacto:** inventário vaza; com o tempo o estacionamento aparece lotado.
- **Correção:** máquina de estados única (ver M-05) e jobs cobrindo todos os estados pendentes.

---

## 4. Achados altos

| ID   | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Onde                                                                        | Prova                                                                   | Correção                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | **Refresh token antigo segue válido após rotação.** O bcrypt só considera os 72 primeiros bytes; todo refresh JWT do mesmo usuário começa igual (header + `{"userId":X,"type":"user"`).                                                                                                                                                                                                                                                                                                                    | `authController.js:122,191`, `userModel.verifyRefreshTokenHash`             | 🔬 token rotacionado reutilizado com sucesso                            | Gerar refresh token **opaco** (32 bytes aleatórios), guardar `sha256` em tabela `sessoes` (uma linha por dispositivo), rotação com detecção de reuso (reuso = revoga a família). |
| A-02 | **Logout forçado de qualquer conta** com JWT sem assinatura.                                                                                                                                                                                                                                                                                                                                                                                                                                               | `authController.js:218` (`jwt.decode` como fallback)                        | 🔬 cookie forjado `alg:none` zerou a sessão da vítima                   | Só agir sobre token verificado; com tokens opacos (A-01) o problema some.                                                                                                        |
| A-03 | **Sem `trust proxy`**: no Fly todo mundo tem o IP do proxy. Limites viram globais: 10 logins errados/15 min, 20 cadastros/h, 10 verificações de e-mail/h e 60 refreshes/15 min **para a plataforma inteira**. `TRUST_PROXY=1` está no `fly.toml` mas o código nunca lê.                                                                                                                                                                                                                                    | `server.js` (ausente), `routes/authRoutes.js:23-63`                         | busca no código: zero ocorrências                                       | `app.set('trust proxy', Number(process.env.TRUST_PROXY \|\| 0))`; limites também por conta/e-mail, não só IP.                                                                    |
| A-04 | **Bloqueio de comprovantes PIX burlável** codificando uma letra da URL.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `server.js:201-207` (regex sobre `req.path` cru; `serve-static` decodifica) | 🔬 `/uploads/%63omprovante-…` → 200 com o conteúdo                      | Tirar comprovantes e fotos de perfil da pasta servida; servir só `uploads/public/`. Melhor: object storage privado (Cloudflare R2) + URL assinada de curta duração.              |
| A-05 | **Contato, newsletter e "solicitar parceria" viram relay de spam/phishing**: sem rate limit, sem captcha, e-mail de resposta vai para o endereço digitado com o `nome` em HTML sem escape. Newsletter não salva nada.                                                                                                                                                                                                                                                                                      | `contactController.js:58-80,138,333`, `routes/contactRoutes.js`             | 🔬 25 de 25 requisições aceitas com `<a href=…>` no nome                | Rate limit por IP+e-mail, Cloudflare Turnstile (grátis), não responder para endereço não verificado, escapar saída, persistir newsletter com double opt-in.                      |
| A-06 | **40 vulnerabilidades em dependências** (2 críticas, 19 altas).                                                                                                                                                                                                                                                                                                                                                                                                                                            | `package-lock.json`                                                         | `npm audit`, Trivy                                                      | Mesclar os 11 PRs do Dependabot, `npm audit fix`, trocar `cpf-cnpj-validator` (puxa `@hapi/joi` vulnerável), Renovate com automerge de patch.                                    |
| A-07 | **Node 18 sem suporte desde abril/2025** no Dockerfile, `engines` e matriz do CI.                                                                                                                                                                                                                                                                                                                                                                                                                          | `Dockerfile:4`, `package.json:7`, `ci.yml`                                  | —                                                                       | Node 24 LTS (ou 22).                                                                                                                                                             |
| A-08 | **Eventos da sala pessoal do motorista não chegam.** `infoUsuario` não existe na página; o handler de conexão lança `ReferenceError` e o socket nunca entra em `usuario_<id>`, então eventos enviados para essa sala (como `atualizacao_reserva`) se perdem. _Correção desta versão do relatório:_ os avisos de pagamento confirmado/rejeitado usam `notificarUsuario`, que procura o socket pelo token e não depende da sala; esses chegavam. Também `mostrarNotificacao` e `temposIniciais` não existem. | `public/user/js/home.inline-4.js:285`, `estacionamento.inline-1.js:54,1110` | 🔬 servidor registrou conexão do usuário 12 e **zero** entradas em sala | Servidor deve colocar o socket na sala do usuário automaticamente a partir do token no handshake (não depender do cliente).                                                      |
| A-09 | **Painel do dono mostra números falsos fixos** (R$ 12.540,00, 24/50, vaga A-12, 78%, gráficos "valores de exemplo").                                                                                                                                                                                                                                                                                                                                                                                       | `public/admin_home/admin/home.html:343`, `js/home.inline-1.js:254,680`      | 🔬 tela de admin sem faturamento exibindo R$ 12.540                     | Endpoint `/api/admin/dashboard` com KPIs reais (faturamento por dia, ocupação por hora, ticket médio, no-show) e estados vazios honestos.                                        |
| A-10 | **Aprovação/rejeição de parceiro por GET** em link de e-mail. Scanners de link (Microsoft Safe Links, antivírus corporativo) abrem o link e podem aprovar ou rejeitar sozinhos; o aprovador não se autentica.                                                                                                                                                                                                                                                                                              | `routes/approvalRoutes.js:37,64`                                            | revisão de código                                                       | Link abre página de confirmação; ação por `POST` autenticado de superadmin, com motivo registrado.                                                                               |
| A-11 | **Horários com 3 horas de erro** se o Postgres estiver em `America/Sao_Paulo`: o parser acrescenta `Z` a todo timestamp. Schema mistura `timestamp` e `timestamptz`.                                                                                                                                                                                                                                                                                                                                       | `utils/dbUtils.js:53-56`                                                    | 🔬 `now()` do banco lido como 10:06Z com relógio real em 13:06Z         | Tudo `timestamptz`, sessão `SET TIME ZONE 'UTC'` no pool, remover os parsers customizados.                                                                                       |
| A-12 | **Estender reserva não cobra o tempo extra.**                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `controllers/reservaController.js:534`                                      | revisão de código                                                       | Gerar cobrança complementar (novo PIX) e só confirmar a extensão após pagamento.                                                                                                 |
| A-13 | **Defesa contra XSS fraca na prática**: CSP libera `unpkg.com`, `cdn.jsdelivr.net` e `cdnjs` inteiros (qualquer pacote npm vira script permitido), `script-src-attr 'unsafe-inline'`, `connect-src wss:` para qualquer host; **51 scripts de CDN, só 1 com SRI**, versões flutuantes (`chart.js` sem versão, `aos@next`, `react@18`, geocoder sem versão); JWT guardado em `localStorage`.                                                                                                                 | `server.js:73-136`, HTMLs de `public/`                                      | contagem automática                                                     | Empacotar dependências com Vite (self-host), remover handlers inline, CSP com `strict-dynamic` + nonce, SRI no que restar de CDN, access token só em memória.                    |
| A-14 | **TLS do Postgres sem verificar certificado** em produção.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `utils/dbUtils.js:22` (`rejectUnauthorized: false`)                         | revisão de código                                                       | `sslmode=verify-full` com CA do provedor.                                                                                                                                        |
| A-15 | **Desativar motorista não derruba o acesso imediatamente**: `protectUser` não confere `status`.                                                                                                                                                                                                                                                                                                                                                                                                            | `middleware/authMiddleware.js:46`                                           | revisão de código                                                       | Checar `status='ativo'` no middleware (o cache de 30 s já existe).                                                                                                               |

---

## 5. Achados médios

| ID   | Achado                                                                                                                                                                                                                                                                                                                                                                                           | Onde                                                         | Correção                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 | **API v2 inteira quebrada** (500: coluna `refresh_token` inexistente) e assina token com o mesmo `JWT_SECRET` sem campo de tipo. 🔬                                                                                                                                                                                                                                                              | `routes/v2/*`, `controllers/v2/*`, `models/User.js:440`      | Remover a v2 ou reescrevê-la sobre o mesmo núcleo da v1.                                                                                            |
| M-02 | Rotas de horário de funcionamento montadas em **`/api/api/horarios`**. 🔬                                                                                                                                                                                                                                                                                                                        | `routes/index.js:93`                                         | Montar em `/horarios`.                                                                                                                              |
| M-03 | Endpoints mortos que dão 500: `/api/pix/webhook` 🔬, `/api/admin/splits/*` 🔬 (resto de Stripe/ASAAS); `/api/status/server` diz banco "offline" com banco online 🔬.                                                                                                                                                                                                                             | `routes/pagamentoRoutes.js:155`, `adminSplitsController.js`  | Remover código morto; status real.                                                                                                                  |
| M-04 | **Duas camadas de dados competindo**: 2 ORMs (Sequelize + `pg`), 4 pools de conexão, 3 modelos de usuário (`User.js`, `userModel.js`, `usuarioModel.js`), 2 de reserva, vaga e estacionamento; 5 módulos de e-mail; 3 de data/hora; 2 serviços de notificação.                                                                                                                                   | `models/`, `config/`, `utils/`, `services/`                  | Escolher **um** acesso a dados (Kysely ou Drizzle sobre `pg`), um pool, um módulo por domínio.                                                      |
| M-05 | **Schema com duplicidades**: `valor_hora`/`preco_hora`, `valor_diaria`/`preco_dia`, `capacidade_total`/`vagas`/`vagas_disponiveis`, chave PIX em 2 tabelas sincronizadas por trigger; **12 status de reserva** sobrepostos (`concluida`/`finalizada`, `ativa`/`em_andamento`…); **9 chaves estrangeiras sem índice** (`reservas.vaga_id`, `estacionamentos.admin_id`, `pagamentos.id_usuario`…). | migrations                                                   | Migration de consolidação; enum de estados com transições explícitas; índices.                                                                      |
| M-06 | **Jobs e tempo real não escalam**: cron dentro do processo + `auto_stop_machines` com `min_machines_running = 0` (com a máquina dormindo nada expira); sem lock (2 instâncias = jobs duplicados); Socket.IO sem adapter; uploads em volume local de 1 máquina.                                                                                                                                   | `services/cronJobs.js`, `fly.toml`                           | `pg-boss` (fila e agendamento no próprio Postgres, gratuito) ou cron externo chamando `/api/cron/*`; adapter Postgres do Socket.IO; object storage. |
| M-07 | `server.listen` tenta a porta seguinte se a 3000 estiver ocupada (em produção mascara falha); desligamento não fecha o Socket.IO.                                                                                                                                                                                                                                                                | `server.js:312,340`                                          | Falhar e sair; `io.close()` no shutdown.                                                                                                            |
| M-08 | Duplicidade de cadastro usa código de erro do **MySQL** (`ER_DUP_ENTRY`): no Postgres (`23505`) vira 500.                                                                                                                                                                                                                                                                                        | `authController.js:35`                                       | Tratar `23505`.                                                                                                                                     |
| M-09 | Login devolve campos internos (`email_verification_token`, `tipo_usuario`, `status`…). 🔬                                                                                                                                                                                                                                                                                                        | `models/userModel.js:223`                                    | DTO explícito de saída.                                                                                                                             |
| M-10 | E-mail não verificado faz login e reserva normalmente (verificação é decorativa).                                                                                                                                                                                                                                                                                                                | `authController.js:102,112`                                  | Exigir verificação antes de reservar/pagar.                                                                                                         |
| M-11 | **Uma sessão por conta**: logar no celular derruba o notebook.                                                                                                                                                                                                                                                                                                                                   | `usuarios.refresh_token_hash`                                | Tabela `sessoes` por dispositivo (resolve junto com A-01).                                                                                          |
| M-12 | **"Escape na entrada"**: `express-validator .escape()` grava `&#x27;` no banco (nome "D'Ávila" vira `D&#x27;Ávila`), estraga a API para apps e não cobre todos os campos (contato ficou de fora).                                                                                                                                                                                                | `routes/authRoutes.js`, `routes/userRoutes.js:25`            | Guardar dado bruto, escapar na saída (templates e `textContent`).                                                                                   |
| M-13 | Swagger (`/api/docs`) e `/metrics` abertos por padrão; comparação do token de métricas não é em tempo constante.                                                                                                                                                                                                                                                                                 | `server.js:217-263`                                          | `DOCS_DISABLED=true` em produção, `crypto.timingSafeEqual`.                                                                                         |
| M-14 | **LGPD ausente no `main`**: sem política de privacidade, termos de uso, consentimento, exportação ou exclusão de dados (a branch `feat/lgpd` tem exportação/exclusão e não foi mesclada); CPF guardado em texto puro; logs com e-mail e placa em nível `info`.                                                                                                                                   | —                                                            | Mesclar `feat/lgpd`, publicar política e termos, base legal por finalidade, retenção, encarregado (DPO), cifrar CPF (`pgcrypto`) ou não coletar.    |
| M-15 | **Backup frágil**: artefato no GitHub Actions de repositório **público** (AES-CBC sem autenticação), sem cópia fora do GitHub, sem teste de restauração; `superfly/flyctl-actions/setup-flyctl@master` sem versão fixa recebendo o token de deploy e do banco.                                                                                                                                   | `.github/workflows/db-backup.yml`, `deploy.yml`              | `age` ou GPG, envio para R2/B2, restauração semanal automática num banco descartável, actions fixadas por SHA.                                      |
| M-16 | **Oracle/Terraform**: SSH aberto para `0.0.0.0/0`; bootstrap cria tabelas com `create-postgres-tables.sql` em vez das migrations (schema diferente do Fly); app conecta como superusuário `postgres`.                                                                                                                                                                                            | `terraform/main.tf:80-84`, `scripts/bootstrap-oracle.sh:219` | SSH só por Tailscale/OCI Bastion, `npm run migrate`, usuário de banco com privilégio mínimo.                                                        |
| M-17 | **Testes não protegem o que importa**: 20% de cobertura; nenhum teste de autorização entre estacionamentos, de preço, de conflito de vaga ou de valor do PIX.                                                                                                                                                                                                                                    | `tests/`                                                     | Testes de contrato de autorização por rota (matriz papel × rota), testes de propriedade para o cálculo de preço, E2E do pagamento completo.         |
| M-18 | `POST /api/notifications/test` disponível em produção para qualquer motorista.                                                                                                                                                                                                                                                                                                                   | `routes/notificationRoutes.js:69`                            | Remover ou restringir a dev.                                                                                                                        |
| M-19 | **UX do motorista**: mapa abre fixo em Guaratinguetá; no celular os rótulos do menu ficam brancos sobre branco; o aviso cobre a busca; o ícone sobrepõe o texto da busca; estacionamentos sem coordenadas somem do mapa sem aviso ao dono; a listagem exige login (nada indexável, nada para converter visitante). 🔬                                                                            | `public/user/home.html` e CSS                                | Geolocalização com fallback por IP/cidade, revisão do layout mobile, página pública por estacionamento (SEO local).                                 |
| M-20 | Geocodificação: OpenCage sem chave → 500; Nominatim chamado pelo servidor sem cache, sem limite e sem autenticação (a política de uso do Nominatim é 1 req/s). 🔬                                                                                                                                                                                                                                | `routes/utilsRoutes.js:140,166`                              | Cache em Postgres, limite, autenticação; geocodificar só no cadastro do estacionamento.                                                             |
| M-21 | Gerador de token cai para `Math.random()` se o `crypto` falhar.                                                                                                                                                                                                                                                                                                                                  | `utils/tokenUtils.js:23`                                     | Falhar fechado.                                                                                                                                     |

---

## 6. Baixos e higiene

- 349 avisos de lint; 102 `console.log` no frontend; `no-undef` reais (ver A-08).
- 1.723 linhas de modelos Sequelize carregados mas não usados de verdade; 6 migrations `.js` do Sequelize ignoradas pelo runner; 6 migrations SQL obsoletas.
- 14 branches remotas já mescladas ou abandonadas; 11 PRs do Dependabot abertos.
- Bootstrap 4.5.2, 4.6.1 e 5.3.0 e jQuery 3.5.1 e 3.6.0 misturados entre páginas; `stackpath.bootstrapcdn.com` está descontinuado.
- `escapeHtml` reimplementado em 11 arquivos; chaves de token diferentes no `localStorage` (`authToken`, `token`, `accessToken`, `adminAuthToken`).
- Admin com bcrypt (custo 12) e motorista com Argon2id: dois esquemas de senha.
- `.env.example` lista mais de 15 variáveis que o código não lê (`SESSION_SECRET`, `TRUST_PROXY`, `RATE_LIMIT_*`, `CORS_ORIGIN`, `API_PREFIX`…).
- Lighthouse: contraste de 2,76:1 nos rótulos verdes da landing, `aria-label` em `<i>` sem papel, ordem de títulos, logo distorcido, marcadores do mapa sem nome acessível, painel sem `meta description`.
- Semgrep: portas publicadas em todas as interfaces nos `docker-compose`, `sslmode=disable` no `monitoring/docker-compose.yml:51`, variável em `href` em `templates/email/confirmacaoPixPendente.hbs:49`.
- `ARQUITETURA_SISTEMA.md` diz Express 4; o projeto usa Express 5.

---

## 7. O que já está bom (manter)

- Helmet com HSTS, `frame-ancestors` negado, `script-src` sem `unsafe-inline`.
- Argon2id para motoristas; tokens de reset e verificação guardados como SHA-256 com expiração.
- Confirmação de pagamento pelo admin com `FOR UPDATE` e checagem de dono; rejeição com motivo.
- Upload de comprovante com magic bytes, re-encode removendo EXIF/GPS e hash anti-duplicação.
- Idempotência persistida no Postgres e escopada por usuário.
- Runner de migrations próprio com checksum e modo estrito.
- `/health`, `/health/ready`, métricas Prometheus, request-id, logs estruturados.
- CI com Postgres real, deploy só depois do CI verde, CodeQL, Dependabot, CODEOWNERS, backup criptografado diário.

---

## 8. Roadmap para produção real

### Fase 0 — Estancar (48 horas)

1. Rotacionar todos os segredos do C-06 e invalidar sessões; limpar histórico; ativar Secret Scanning + Push Protection.
2. Tirar do ar ou corrigir: criação de reserva (C-01, C-02, C-03), `PATCH /api/admin/users/:id/status` (C-04), rotas admin sem escopo (C-05).
3. Corrigir C-07 (hash no cadastro) e apagar as solicitações pendentes com senha em claro.
4. `app.set('trust proxy', 1)` (A-03) e mover comprovantes para fora da pasta pública (A-04).
5. Rate limit + Turnstile em contato/newsletter/parceria (A-05).

### Fase 1 — Base sólida (2 a 4 semanas)

- **Sessões:** refresh token opaco por dispositivo com detecção de reuso (A-01, A-02, M-11); 2FA TOTP e passkeys para donos de estacionamento.
- **Autorização:** papéis `superadmin`, `dono`, `gerente`, `operador`; Row Level Security no Postgres como segunda barreira; teste automático de matriz papel × rota.
- **Domínio de reserva:** motor de preço no servidor (fração, tolerância, diária, pernoite, mensalista), máquina de estados única, constraint de exclusão por vaga e período, expiração confiável.
- **Dados:** um único acesso a dados, schema consolidado, `timestamptz` + UTC, índices, CPF cifrado.
- **Dependências e runtime:** Node 24, zerar `npm audit`, Renovate, actions fixadas por SHA.
- **LGPD:** mesclar `feat/lgpd`, política, termos, consentimento, retenção, canal do titular.
- **Testes:** cobertura mínima de 70% nos módulos de pagamento, reserva e auth; E2E do fluxo completo no CI.

### Fase 2 — Pronto para escalar (1 a 3 meses)

- **Pagamento automático:** PIX com QR dinâmico e **webhook de confirmação** pela conta PJ do próprio estacionamento (Banco Inter Empresas, Efí, Sicoob, Banco do Brasil têm API Pix; confirme tarifas de cada banco), eliminando a conferência manual de comprovante. **Pix Automático** (Bacen) para mensalistas.
- **Fila e jobs:** `pg-boss` no Postgres (expiração, e-mails, notificações) com padrão outbox.
- **Tempo real distribuído:** adapter Postgres do Socket.IO, salas por estacionamento e por usuário definidas no servidor.
- **Arquivos:** Cloudflare R2 privado com URLs assinadas.
- **Frontend:** migrar as páginas para um app único (React + Vite ou SvelteKit) com PWA offline para o operador, TypeScript, design system, i18n.
- **Observabilidade:** OpenTelemetry → Grafana Cloud; Sentry; SLOs (disponibilidade da reserva, tempo até confirmação do pagamento) e alertas.
- **Fiscal:** emissão de NFS-e pelo padrão nacional (Emissor Nacional/gov.br) e preparação para IBS/CBS da reforma tributária.

### Fase 3 — Liderança em smart parking (3 a 12 meses)

- **Pátio automatizado:** leitura de placa (LPR) com câmeras IP e modelos abertos (por exemplo Frigate com LPR ou YOLO + OCR de placa Mercosul) liberando cancela via relé/ESP32 por MQTT; check-in e check-out sem toque, cobrança automática na saída.
- **Sensores de vaga:** magnetômetro ou ultrassom com LoRaWAN (The Things Network comunitária) para ocupação em tempo real sem operador.
- **Precificação dinâmica** por ocupação, horário e evento; previsão de lotação com série histórica.
- **B2B e ecossistema:** convênio/validação de ticket por lojas e empresas, multiunidade para redes, API pública com chaves e webhooks, integração com Waze/Google Maps (deep link), vagas para carro elétrico com carregador, vagas PcD/idoso destacadas.
- **Produto do motorista:** reserva recorrente, carteira e cashback, avaliações, histórico fiscal, app nas lojas via Capacitor ou Expo.
- **Gestão do operador:** caixa e fechamento, tabela de preços por convênio, controle de mensalistas, relatórios de faturamento e ocupação, papéis de funcionário com trilha de auditoria.

---

## 9. Stack recomendada 100% gratuita

| Necessidade             | Opção gratuita                                                    | Observação                                                                                    |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Servidor                | **Oracle Cloud Always Free** (VM Ampere A1)                       | O Terraform já existe; corrigir M-16. O Fly.io não tem mais plano gratuito para contas novas. |
| Banco                   | Postgres na própria VM Oracle, ou **Neon** / **Supabase** free    | Neon e Supabase têm limite de armazenamento e pausam por inatividade.                         |
| Arquivos e backup       | **Cloudflare R2** (10 GB grátis, sem taxa de saída)               | Comprovantes privados com URL assinada.                                                       |
| CDN, WAF, DNS, anti-bot | **Cloudflare** free + **Turnstile**                               | Substitui o reCAPTCHA.                                                                        |
| E-mail transacional     | **Brevo** (300/dia) ou **Resend** (3.000/mês)                     | Gmail SMTP não serve para produção (limite e termos).                                         |
| Erros                   | **Sentry** free ou GlitchTip auto-hospedado                       | O código já tem a fachada `errorTracker`.                                                     |
| Métricas, logs, traces  | **Grafana Cloud** free                                            | Prometheus já existe.                                                                         |
| Uptime                  | **UptimeRobot** / Better Stack free                               | Monitorar `/health/ready`.                                                                    |
| Filas e agendamento     | **pg-boss**                                                       | Roda no mesmo Postgres.                                                                       |
| Mapas                   | OSM + **MapLibre** + Photon/Nominatim com cache                   | Respeitar política de uso.                                                                    |
| Segurança no CI         | CodeQL, Dependabot, Secret Scanning, gitleaks, Semgrep OSS, Trivy | Todos grátis em repositório público.                                                          |
| LPR / IoT               | Frigate, YOLO + OCR, ESP32, MQTT (Mosquitto), TTN                 | Hardware tem custo; software é aberto.                                                        |

Pagamento PIX automático depende do banco de cada estacionamento: a API Pix é oferecida pelos bancos, mas a tarifa varia; confirme antes de prometer "sem custo".

---

## 10. Status da Fase 0 (branch `fix/fase-0-criticos`)

Corrigido e **reverificado ao vivo** contra servidor e banco reais, com as mesmas provas da auditoria. Suíte de testes: **87 de 87 passando** (eram 75 de 76; entraram 11 testes novos de preço, hash de sessão e expiração). Lint: 0 erros.

| Item       | O que mudou                                                                                                                                                                                                                                                                     | Prova depois da correção                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C-01, C-02 | Preço calculado no servidor (`utils/pricing.js`: hora iniciada, teto por diária, em centavos); PIX recusa valor inválido; frontend parou de mandar R$ 10 fixo                                                                                                                   | Envio de R$ 0,01 para 2 h gerou R$ 20,00, QR com campo 54, pagamento gravado 20.00           |
| C-03       | Reserva numa única transação: vaga travada, do mesmo estacionamento, livre e sem sobreposição; datas validadas (sem passado, saída depois da entrada, até 90 dias de antecedência e 30 de duração); constraint de exclusão no banco; sem vaga escolhida, aloca a primeira livre | Vaga ocupada, datas invertidas, data em 2020 e vaga de outro estacionamento: todas recusadas |
| C-04       | Novo papel `superadmin` (equipe ParkNow); só ele altera conta de motorista; resposta 404 falsa corrigida; motorista desativado perde o acesso                                                                                                                                   | Dono de estacionamento recebe 403 e o status não muda                                        |
| C-05       | Toda rota admin filtrada pelos estacionamentos do dono; Socket.IO com sala por estacionamento e payload público sem placa/nome                                                                                                                                                  | Admin sem estacionamento vê 0 vagas; dono vê só as suas                                      |
| C-06       | Job `gitleaks` no CI, `.gitleaks.toml`, guia `docs/ROTACAO_DE_SEGREDOS.md`                                                                                                                                                                                                      | Árvore atual sem segredos. **A rotação em si precisa ser feita por você**                    |
| C-07       | Senha do parceiro vira hash bcrypt já no cadastro, nos **dois** fluxos (o formulário de contato também gravava em claro); migration converte as solicitações antigas; token de aprovação parou de ir inteiro para o log                                                         | 0 senhas em claro; hash confere com a senha                                                  |
| C-08       | Migration cria `admins.refresh_token_hash`                                                                                                                                                                                                                                      | Login de admin funciona em banco novo                                                        |
| C-09       | Expiração cobre `pendente_pagamento`; quem já enviou comprovante aguarda o admin até o fim do período; variável `PIX_PENDING_TIMEOUT_MIN` passou a valer                                                                                                                        | Testes de integração novos                                                                   |
| A-01, A-02 | Refresh token guardado como SHA-256 com comparação em tempo constante; logout só aceita token com assinatura válida                                                                                                                                                             | Token antigo: 401. Logout forjado: sem efeito                                                |
| A-03       | `trust proxy` lido de `TRUST_PROXY`                                                                                                                                                                                                                                             | IP que errou a senha bloqueado no 11º; outro cliente segue entrando                          |
| A-04       | `/uploads` serve só fotos de estacionamento (lista de permitidos) e recusa URL codificada                                                                                                                                                                                       | `%63omprovante`, `%2563…` e `..%2F` dão 404; foto pública dá 200                             |
| A-05       | Limite de 5/h (3/h na parceria) por IP, Turnstile opcional, HTML escapado, resposta automática sem ecoar o que foi digitado                                                                                                                                                     | 6º envio: 429                                                                                |
| Extra      | Sessão do banco fixa em UTC (horários 3 h errados), cartão/dinheiro não "aprovam sozinhos", rotas admin devolvem 401 (renovação de sessão volta a funcionar), sala pessoal do motorista definida pelo servidor, teste do OpenAPI no Windows                                     | —                                                                                            |

**Efeitos do deploy que você precisa saber:** todos os usuários e admins vão precisar logar de novo (o formato do hash da sessão mudou); ninguém é `superadmin` até você definir (`UPDATE admins SET nivel_acesso = 'superadmin' WHERE email = '…';`); pagamentos antigos com valor `NaN` continuam no banco e pedem limpeza manual.

**Ainda não resolvido (Fases 1 a 3):** A-06 a A-15 exceto os listados acima, todos os médios e baixos, LGPD, painel admin com números reais, aprovação de parceiro por POST.

---

## 11. Como reproduzir as provas

```powershell
# banco isolado + servidor (exemplo usado nesta auditoria)
npm ci
npm run migrate        # PG_* apontando para um banco vazio
node server.js         # PORT=3456

# C-01/C-02/C-03: criar reserva com valor 0.01, vaga ocupada e datas invertidas
# POST /api/reservas/com-pagamento  {"estacionamento_id":10,"vaga_id":11,"data_entrada":"2020-01-01T15:00:00Z","data_saida":"2020-01-01T10:00:00Z","valor":0.01}
# depois: SELECT valor FROM pagamentos ORDER BY id DESC LIMIT 1;  -> NaN

# A-04: GET /uploads/%63omprovante-<arquivo>  -> 200
```

Os scripts e saídas completas (lint, Jest, npm audit, Trivy, gitleaks, SARIF do Semgrep, relatórios Lighthouse) ficaram na pasta temporária da sessão e podem ser regerados com os mesmos comandos.
