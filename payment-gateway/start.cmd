@echo off
echo Iniciando ParkNow Payment Gateway...
echo ============================================
echo.

echo Verificando dependências...

:: Verifica se o Node.js está instalado
node -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Erro: Node.js não está instalado. Por favor, instale o Node.js (versão 16 ou superior) e tente novamente.
    echo Baixe em: https://nodejs.org/
    pause
    exit /b 1
)

:: Verifica se o npm está instalado
npm -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Erro: npm não está instalado. Por favor, instale o npm e tente novamente.
    pause
    exit /b 1
)

:: Verifica se o arquivo .env existe
if not exist .env (
    echo Aviso: O arquivo .env não foi encontrado. Criando a partir do arquivo de exemplo...
    copy /y .env.example .env >nul
    echo Arquivo .env criado com sucesso a partir do exemplo.
    echo Por favor, configure as variáveis de ambiente antes de continuar.
    pause
    exit /b 1
)

echo Iniciando o servidor...
echo.

echo Acesse a documentação da API em: http://localhost:3000/api-docs
echo Pressione Ctrl+C para encerrar o servidor.
echo.

:: Inicia o servidor
npm start

if %ERRORLEVEL% neq 0 (
    echo.
    echo Ocorreu um erro ao iniciar o servidor.
    echo Verifique as mensagens de erro acima para mais detalhes.
    pause
    exit /b 1
)
