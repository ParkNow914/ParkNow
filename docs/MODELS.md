# Modelos: status e canônico

A pasta `models/` contém duas linhagens convivendo:

- **pg-native** (camelCase lowercase, ex.: `userModel.js`): funções soltas que executam SQL via pool `pg`. Esta é a linhagem **em uso** nos controllers atuais.
- **Sequelize** (PascalCase, ex.: `User.js`): classes ORM que estavam sendo introduzidas mas nunca substituíram totalmente a linhagem pg-native.

## Mapa canônico

| Entidade | Canônico (use este) | Status do(s) outro(s) | Observação |
|---|---|---|---|
| Usuário | `models/userModel.js` (pg-native, helper de auth) | `User.js` (Sequelize): **em uso** via `db.User.findByPk` em `estacionamentoController`; `usuarioModel.js`: helper especializado | Coexistem por design: pg-native em rotas leves, Sequelize em queries com `include`. Apenas `findDefaultVehicleByUserId` de `usuarioModel.js` é importado em `services/reservaService.js`. |
| Estacionamento | `models/estacionamentoModel.js` (híbrido: usa Sequelize Op internamente) | `Estacionamento.js` (Sequelize puro): usado via `models/index.js` `{Estacionamento}` | Híbrido — `estacionamentoModel` importa o modelo Sequelize via `require('../models')`. Não tocar sem migration plan. |
| Reserva | `models/reservaModel.js` (pg-native, fluxo principal) | `Reserva.js` (Sequelize): **em uso** via `db.Reserva.findByPk` em `pixPaymentController` | Coexistem por design. |
| Vaga | `models/vagaModel.js` (pg-native) | `Vaga.js` (Sequelize): **em uso** via `db.Vaga.findByPk`/`count`/`bulkCreate` em `estacionamentoController`, `approvalController`, `pixPaymentController` | Coexistem por design. |
| Horário Funcionamento | `models/HorarioFuncionamento.js` | `models/HorarioFuncionamentoModel.js`: duplicata divergente | Ambos carregados por `models/index.js` (ambos começam com maiúscula); o segundo a carregar vence em `db`. Avaliar remoção do `HorarioFuncionamentoModel.js`. |
| Pagamento | `models/pagamentoModel.js` | — | Não há duplicata. |
| Notificação | `models/notificacaoModel.js` | — | Não há duplicata. |
| Veículo | `models/veiculoModel.js` | — | |
| Admin | `models/adminModel.js` | — | |
| Log | `models/logModel.js` | — | |

## Por que não consolidamos agora

Migrar de pg-native para Sequelize (ou vice-versa) requer:

1. Reescrita coordenada de **todos** os controllers/services que tocam a entidade.
2. Testes de integração de banco para validar regressões.
3. Migration plan para `models/index.js` (que registra todas as Sequelize models e expõe associações).

O ganho não compensa o risco numa onda de hardening sem cobertura de teste de integração ao Postgres. As próximas ondas devem:

- **Onda 5+** — escolher uma linhagem para cada entidade onde as duas coexistem (`User`, `Reserva`, `Vaga`) e migrar consumidores de forma incremental, começando pelos paths com cobertura de teste.
- **Onda 5** — avaliar remoção de `HorarioFuncionamentoModel.js` (duplicata divergente de `HorarioFuncionamento.js`); ambos são carregados, mas apenas um vence em `db`.

## Convenção temporária (até consolidar)

- Para **novo código**, importe sempre o arquivo listado como _Canônico_.
- Se você adicionar uma função a uma entidade, adicione no canônico, não nas duplicatas.
- Não remova arquivos duplicados sem `grep -rn` confirmando zero uso.
