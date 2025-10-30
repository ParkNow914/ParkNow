# Guia de Manutenção - ParkNow Payment Gateway

Este guia fornece informações essenciais para a manutenção e solução de problemas do ParkNow Payment Gateway.

## Índice

1. [Monitoramento](#monitoramento)
2. [Backup e Recuperação](#backup-e-recuperação)
3. [Atualizações de Segurança](#atualizações-de-segurança)
4. [Escalabilidade](#escalabilidade)
5. [Solução de Problemas Comuns](#solução-de-problemas-comuns)
6. [Contatos de Emergência](#contatos-de-emergência)

## Monitoramento

### Métricas de Desempenho

- **Uso de CPU**: Deve permanecer abaixo de 70% em condições normais
- **Uso de Memória**: Deve permanecer abaixo de 80% de utilização
- **Tempo de Resposta**: Média abaixo de 500ms para 95% das requisições
- **Taxa de Erros**: Menos de 1% de erros HTTP 5xx

### Ferramentas Recomendadas

- **PM2**: Monitoramento de processos Node.js
  ```bash
  # Verificar status dos processos
  pm2 list
  
  # Verificar logs em tempo real
  pm2 logs
  
  # Monitorar recursos
  pm2 monit
  ```

- **Docker**: Monitoramento de containers
  ```bash
  # Verificar status dos containers
  docker ps -a
  
  # Verificar uso de recursos
  docker stats
  
  # Verificar logs de um container
  docker logs <container_id>
  ```

- **Nginx**: Monitoramento de requisições
  ```bash
  # Verificar logs de acesso
  tail -f /var/log/nginx/access.log
  
  # Verificar logs de erro
  tail -f /var/log/nginx/error.log
  ```

## Backup e Recuperação

### Banco de Dados

#### Backup Automático

Os backups são realizados diariamente às 2h da manhã e mantidos por 30 dias.

#### Backup Manual

```bash
# Backup do banco de dados PostgreSQL
docker exec -t parknow-payment-db pg_dump -U postgres payment_gateway > backup_$(date +%Y%m%d).sql

# Compactar o backup
gzip backup_$(date +%Y%m%d).sql
```

#### Recuperação

```bash
# Descompactar o backup
gunzip backup_20230601.sql.gz

# Restaurar o banco de dados
cat backup_20230601.sql | docker exec -i parknow-payment-db psql -U postgres payment_gateway
```

### Arquivos de Configuração

Faça backup periódico dos seguintes arquivos:

- `/var/www/parknow-payment-gateway/.env`
- `/etc/nginx/conf.d/parknow.conf`
- `/etc/letsencrypt/` (Certificados SSL)

## Atualizações de Segurança

### Atualizações do Sistema Operacional

Execute pelo menos mensalmente:

```bash
# Atualizar lista de pacotes
apt update

# Verificar atualizações de segurança
apt list --upgradable

# Aplicar atualizações de segurança
apt upgrade -y
```

### Atualizações de Dependências

Execute semanalmente:

```bash
# Verificar dependências desatualizadas
npm outdated

# Atualizar dependências
npm update
```

### Verificação de Vulnerabilidades

```bash
# Verificar vulnerabilidades conhecidas
npm audit

# Corrigir vulnerabilidades automaticamente (quando possível)
npm audit fix
```

## Escalabilidade

### Aumentando a Capacidade

1. **Aumento de Recursos**
   - CPU: Aumente os limites de CPU no `docker-compose.prod.yml`
   - Memória: Ajuste os limites de memória conforme necessário
   - Armazenamento: Aumente os volumes conforme necessário

2. **Balanceamento de Carga**
   - Adicione mais instâncias do serviço atrás de um balanceador de carga
   - Configure o Nginx como um balanceador de carga

3. **Cache**
   - Utilize o Redis para cache de consultas frequentes
   - Configure o Nginx para cache de respostas

### Monitoramento de Desempenho

```bash
# Verificar uso de recursos
top

# Verificar uso de disco
df -h

# Verificar uso de memória
free -m
```

## Solução de Problemas Comuns

### O serviço não está respondendo

1. Verifique se o container está em execução:
   ```bash
   docker ps | grep parknow
   ```

2. Verifique os logs do container:
   ```bash
   docker logs parknow-payment-gateway
   ```

3. Verifique se a porta está aberta:
   ```bash
   netstat -tuln | grep 3000
   ```

### Erros de Banco de Dados

1. Verifique se o PostgreSQL está em execução:
   ```bash
   docker exec -it parknow-payment-db psql -U postgres -c "\l"
   ```

2. Verifique os logs do PostgreSQL:
   ```bash
   docker logs parknow-payment-db
   ```

### Problemas de Rede

1. Verifique a conectividade:
   ```bash
   ping api.parknow.com.br
   ```

2. Verifique as regras de firewall:
   ```bash
   iptables -L -n
   ```

## Contatos de Emergência

### Equipe de Desenvolvimento

- **Desenvolvedor Sênior**: João Silva - joao.silva@parknow.com.br - +55 11 98765-4321
- **Arquiteto de Software**: Maria Oliveira - maria.oliveira@parknow.com.br - +55 11 98765-1234
- **Gerente de Projeto**: Carlos Santos - carlos.santos@parknow.com.br - +55 11 98765-5678

### Suporte 24/7

- **Plantão Técnico**: +55 11 4004-1234
- **E-mail de Suporte**: suporte@parknow.com.br
- **Slack**: #suporte-urgente

### Links Úteis

- [Painel de Monitoramento](https://monitor.parknow.com)
- [Documentação da API](https://api.parknow.com.br/api-docs)
- [Repositório do Projeto](https://github.com/parknow/payment-gateway)
- [Kanban de Tarefas](https://github.com/orgs/parknow/projects/1)

## Procedimentos de Emergência

### Restauração de Serviço

1. **Identifique o problema** verificando os logs
2. **Isole o problema** desativando serviços não essenciais
3. **Restaure o serviço** usando o procedimento apropriado
4. **Documente a falha** e as ações tomadas

### Comunicação

1. **Notifique a equipe** pelo canal de emergência
2. **Atualize o status** no painel de monitoramento
3. **Comunique os usuários** sobre interrupções planejadas ou não planejadas

## Próximos Passos

- [ ] Revisar e atualizar este guia a cada 3 meses
- [ ] Realizar treinamento da equipe sobre procedimentos de emergência
- [ ] Revisar e testar os procedimentos de backup e recuperação trimestralmente
