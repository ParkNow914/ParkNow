# Sistema de Backup Automático - ParkNow

Este é um sistema de backup automático para o banco de dados PostgreSQL do ParkNow. Ele cria backups a cada 5 minutos e mantém apenas os 10 mais recentes.

## Pré-requisitos

- Node.js 14 ou superior
- PostgreSQL instalado e em execução
- Permissões de administrador para instalar o serviço do Windows

## Instalação

1. Navegue até a pasta do script:
   ```
   cd c:\xampp\htdocs\PI_NODE\scripts
   ```

2. Instale as dependências:
   ```
   npm install
   ```

3. Certifique-se de que o arquivo `.env` na raiz do projeto contenha as configurações corretas do banco de dados:
   ```
   PG_USER=seu_usuario
   PG_PASSWORD=sua_senha
   PG_HOST=localhost
   PG_DATABASE=parknow_db
   PG_PORT=5432
   ```

4. Execute o script de instalação como administrador:
   ```
   install-service.bat
   ```

## Como usar

- O serviço será instalado e iniciado automaticamente
- Os backups serão armazenados na pasta `backups`
- Os logs podem ser encontrados na pasta `logs`

## Desinstalação

Para remover o serviço, execute como administrador:
```
uninstall-service.bat
```

## Solução de problemas

- Verifique os arquivos de log em `logs/backup-error.log` para erros
- Certifique-se de que o PostgreSQL está em execução
- Verifique se as credenciais no arquivo `.env` estão corretas

## Licença

Este projeto é de uso exclusivo do ParkNow.
