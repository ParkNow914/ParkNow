# Security Policy

## Versões Suportadas

Atualmente, estamos fornecendo atualizações de segurança para as seguintes versões:

| Versão | Suportada          |
| ------ | ------------------ |
| 1.0.x  | :white_check_mark: |
| < 1.0  | :x:                |

## Reportando uma Vulnerabilidade

A segurança do ParkNow é levada muito a sério. Se você descobriu uma vulnerabilidade de segurança, agradecemos sua ajuda em divulgá-la de forma responsável.

### Como Reportar

**Por favor, NÃO reporte vulnerabilidades de segurança através de issues públicas do GitHub.**

Em vez disso, envie um e-mail para: alimiguel1098@gmail.com

Você deve receber uma resposta dentro de 48 horas. Se por algum motivo você não receber, por favor, acompanhe por e-mail para garantir que recebemos sua mensagem original.

### Informações a Incluir

Para nos ajudar a entender melhor a natureza e o escopo do possível problema, inclua o máximo de informações possível:

- Tipo de problema (ex: buffer overflow, SQL injection, cross-site scripting, etc.)
- Caminhos completos dos arquivos de código-fonte relacionados
- A localização do código-fonte afetado (tag/branch/commit ou URL direto)
- Qualquer configuração especial necessária para reproduzir o problema
- Instruções passo a passo para reproduzir o problema
- Prova de conceito ou código de exploração (se possível)
- Impacto do problema, incluindo como um invasor pode explorar o problema

### Política de Divulgação

Quando a equipe de segurança recebe um relatório de vulnerabilidade, eles irão:

1. Confirmar o problema e determinar as versões afetadas
2. Auditar o código para encontrar quaisquer problemas similares potenciais
3. Preparar correções para todas as versões ainda em manutenção
4. Liberar novas versões de segurança assim que possível

### Comentários sobre esta Política

Se você tiver sugestões sobre como este processo pode ser melhorado, por favor, envie um pull request.

## Práticas de Segurança Recomendadas

Ao usar o ParkNow, recomendamos:

1. Manter todas as dependências atualizadas
2. Usar variáveis de ambiente para informações sensíveis
3. Implementar HTTPS em produção
4. Configurar firewalls e limitar acesso ao banco de dados
5. Fazer backups regulares
6. Monitorar logs para atividades suspeitas
7. Implementar autenticação de dois fatores quando possível

## Avisos de Segurança

Avisos de segurança serão publicados como [GitHub Security Advisories](https://github.com/ParkNow914/ParkNow/security/advisories) e mencionados nas notas de lançamento.
