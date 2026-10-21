@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  DESPLEGUE ESQUELAS DE PAGO A GITHUB + VERCEL
echo ============================================
echo.

REM Verificar si git esta instalado
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git no esta instalado o no esta en el PATH.
    echo Instalalo desde https://git-scm.com y vuelve a ejecutar este script.
    pause
    exit /b 1
)

REM Ir a la carpeta del script
cd /d "%~dp0"

echo [1/6] Inicializando repositorio git local...
git init >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR al ejecutar git init.
    pause
    exit /b 1
)
echo   OK

echo [2/6] Agregando archivos al stage...
git add .
if %errorlevel% neq 0 (
    echo ERROR al ejecutar git add.
    pause
    exit /b 1
)
echo   OK

echo [3/6] Creando commit inicial...
git commit -m "Initial commit: Esquelas de Pago - version web para Vercel" >nul 2>&1
if %errorlevel% neq 0 (
    echo Advertencia: puede que no haya cambios para commit o ya exista un commit previo.
)
echo   OK

echo.
echo [4/6] Configuracion de repositorio remoto (GitHub)
echo --------------------------------------------------
echo Antes de continuar, haz lo siguiente:
echo 1. Ve a https://github.com y crea un repositorio NUEVO y VACIO.
echo    Nombre sugerido: esquelas-pagos-4
echo    NO marques "Add a README file"
echo    NO marques "Add .gitignore"
echo    NO elijas licencia por ahora
echo.
set /p github_user="Ingresa tu usuario de GitHub: "
set /p repo_name="Ingresa el nombre del repositorio (ej. esquelas-pagos-4): "

set repo_url=https://github.com/%github_user%/%repo_name%.git

echo.
echo Agregando remoto origen...
git remote remove origin >nul 2>&1
git remote add origin %repo_url%
if %errorlevel% neq 0 (
    echo ERROR al agregar el remoto.
    pause
    exit /b 1
)
echo   OK

echo [5/6] Subiendo codigo a GitHub...
git branch -M main
git push -u origin main
if %errorlevel% neq 0 (
    echo ERROR al hacer push. Verifica que el repositorio exista y que tengas permisos.
    pause
    exit /b 1
)
echo   OK. Codigo subido a: %repo_url%

echo.
echo [6/6] Despliegue en Vercel
echo --------------------------------------------------
echo Ahora haz lo siguiente en tu navegador:
echo 1. Ve a https://vercel.com e inicia sesion con tu cuenta de GitHub.
echo 2. Clic en "Add New Project".
echo 3. Importa el repositorio: %github_user%/%repo_name%
echo 4. Framework Preset: Other
echo 5. Build Command: (dejar vacio)
echo 6. Output Directory: (dejar vacio)
echo 7. Clic en Deploy.
echo.
echo Tu sitio quedara disponible en algo como:
echo    https://%repo_name%.vercel.app
echo.

echo ============================================
echo  PROCESO COMPLETADO
echo ============================================
pause
endlocal