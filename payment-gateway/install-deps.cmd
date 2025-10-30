@echo off
echo Instalando dependências do projeto...

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

echo Instalando dependências do Node.js...
npm install

if %ERRORLEVEL% neq 0 (
    echo Erro ao instalar as dependências do Node.js.
    pause
    exit /b 1
)

echo.
echo ============================================
echo Dependências instaladas com sucesso!
echo ============================================
echo.
echo Configure as variáveis de ambiente no arquivo .env
echo e execute o projeto com: npm start
echo.
pause
