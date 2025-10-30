@echo off
setlocal enabledelayedexpansion
echo ============================================
echo ParkNow Payment Gateway - Ambiente de Desenvolvimento
echo ============================================
echo.

:menu
cls
echo 1. Iniciar ambiente de desenvolvimento
echo 2. Parar ambiente de desenvolvimento
echo 3. Reconstruir e reiniciar containers
echo 4. Acessar logs dos containers
echo 5. Acessar banco de dados (pgAdmin)
echo 6. Acessar documentação da API
echo 7. Executar migrações do banco de dados
echo 8. Executar testes
echo 9. Sair
echo.
set /p choice=Escolha uma opção: 

echo.

if "%choice%"=="1" goto start_env
if "%choice%"=="2" goto stop_env
if "%choice%"=="3" goto rebuild_env
if "%choice%"=="4" goto show_logs
if "%choice%"=="5" goto open_pgadmin
if "%choice%"=="6" goto open_docs
if "%choice%"=="7" goto run_migrations
if "%choice%"=="8" goto run_tests
if "%choice%"=="9" goto exit

echo Opção inválida. Pressione qualquer tecla para continuar...
pause >nul
goto menu

:start_env
echo Iniciando ambiente de desenvolvimento...
docker-compose -f docker-compose.dev.yml up -d
echo.
echo Ambiente de desenvolvimento iniciado!
echo Acesse a documentação em: http://localhost:3000/api-docs
echo PgAdmin disponível em: http://localhost:5050
echo.
pause
goto menu

:stop_env
echo Parando ambiente de desenvolvimento...
docker-compose -f docker-compose.dev.yml down
echo.
echo Ambiente de desenvolvimento parado.
echo.
pause
goto menu

:rebuild_env
echo Reconstruindo e reiniciando containers...
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up -d
echo.
echo Containers reconstruídos e reiniciados com sucesso!
echo.
pause
goto menu

:show_logs
cls
echo 1. Ver logs do serviço principal (app)
echo 2. Ver logs do banco de dados
echo 3. Ver logs do Redis
echo 4. Ver logs do PgAdmin
echo 5. Voltar ao menu principal
echo.
set /p log_choice=Escolha uma opção: 

echo.

if "%log_choice%"=="1" goto logs_app
if "%log_choice%"=="2" goto logs_db
if "%log_choice%"=="3" goto logs_redis
if "%log_choice%"=="4" goto logs_pgadmin
if "%log_choice%"=="5" goto menu

echo Opção inválida. Pressione qualquer tecla para continuar...
pause >nul
goto show_logs

:logs_app
docker-compose -f docker-compose.dev.yml logs -f app
goto show_logs

:logs_db
docker-compose -f docker-compose.dev.yml logs -f db
goto show_logs

:logs_redis
docker-compose -f docker-compose.dev.yml logs -f redis
goto show_logs

:logs_pgadmin
docker-compose -f docker-compose.dev.yml logs -f pgadmin
goto show_logs

:open_pgadmin
start http://localhost:5050
echo PgAdmin aberto no navegador padrão.
echo Credenciais:
echo Email: admin@parknow.com
echo Senha: admin
echo.
pause
goto menu

:open_docs
start http://localhost:3000/api-docs
echo Documentação da API aberta no navegador padrão.
echo.
pause
goto menu

:run_migrations
echo Executando migrações do banco de dados...
docker-compose -f docker-compose.dev.yml exec app npx sequelize-cli db:migrate
echo.
echo Migrações concluídas!
echo.
pause
goto menu

:run_tests
echo Executando testes...
docker-compose -f docker-compose.dev.yml exec -T app npm test
if %ERRORLEVEL% neq 0 (
    echo.
    echo Erro ao executar os testes.
    pause
    goto menu
)
echo.
echo Testes concluídos com sucesso!
echo.
pause
goto menu

exit
echo.
echo Obrigado por usar o ParkNow Payment Gateway!
echo.
pause
