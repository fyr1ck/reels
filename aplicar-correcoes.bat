@echo off
setlocal enabledelayedexpansion
echo ============================================
echo   Aplicar correcoes - Instagram Reels Manager
echo ============================================
echo.
echo Arraste a pasta do seu PROJETO ANTIGO (a que ja tem a pasta
echo node_modules e o arquivo .env dentro) para esta janela e aperte ENTER.
echo.
echo Exemplo de caminho:
echo   C:\Users\Vinicin\Desktop\instagram-reels-manager\instagram-reels-manager
echo.
set /p TARGET="Caminho do projeto antigo: "

rem remove aspas (o Windows adiciona aspas quando voce arrasta uma pasta)
set TARGET=%TARGET:"=%

if not exist "%TARGET%\package.json" (
  echo.
  echo [ERRO] Nao encontrei package.json dentro de:
  echo   %TARGET%
  echo Confirme que arrastou a pasta certa ^(a que tem server, client, package.json^) e tente de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo Copiando arquivos corrigidos para:
echo   %TARGET%
echo.

copy /Y "%~dp0server\services\instagramAuth.js" "%TARGET%\server\services\instagramAuth.js" >nul && (echo [OK] server\services\instagramAuth.js) || (echo [FALHOU] server\services\instagramAuth.js)
copy /Y "%~dp0server\services\instagramPublisher.js" "%TARGET%\server\services\instagramPublisher.js" >nul && (echo [OK] server\services\instagramPublisher.js) || (echo [FALHOU] server\services\instagramPublisher.js)
copy /Y "%~dp0server\routes\videos.js" "%TARGET%\server\routes\videos.js" >nul && (echo [OK] server\routes\videos.js) || (echo [FALHOU] server\routes\videos.js)
copy /Y "%~dp0server\playwright\selectors.js" "%TARGET%\server\playwright\selectors.js" >nul && (echo [OK] server\playwright\selectors.js) || (echo [FALHOU] server\playwright\selectors.js)
copy /Y "%~dp0client\src\pages\Queue.jsx" "%TARGET%\client\src\pages\Queue.jsx" >nul && (echo [OK] client\src\pages\Queue.jsx) || (echo [FALHOU] client\src\pages\Queue.jsx)

echo.
echo ============================================
echo Concluido!
echo.
echo Proximo passo:
echo 1^) Feche qualquer terminal com "npm run dev" rodando ^(Ctrl+C ou feche a janela^)
echo 2^) Dentro da pasta do projeto ANTIGO, rode: npm run dev
echo 3^) No navegador, aperte Ctrl+F5 na aba do painel para forcar recarregar
echo ============================================
echo.
pause
