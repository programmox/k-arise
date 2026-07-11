@echo off
REM Lanceur K-Arise pour Windows. Double-clique ce fichier.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python devserver.py
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py devserver.py
  ) else (
    echo Python n'est pas installe. Installe-le depuis https://www.python.org/downloads/ ^(coche "Add Python to PATH"^).
    pause
  )
)
