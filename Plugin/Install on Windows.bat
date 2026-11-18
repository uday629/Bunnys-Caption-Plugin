@echo off
setlocal
rem Bunnys Caption installer - by Bunnys Framelab (instagram.com/bunnysframelab)
rem Copies the panel into your user CEP extensions folder and allows unsigned panels.

set "SRC=%~dp0"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.bunnysframelab.caption"

echo.
echo  Bunnys Caption installer
echo  ------------------------
echo  Installing to: %DEST%
echo.

if not exist "%SRC%mogrt\Bunnys Caption.mogrt" (
  echo  ERROR: mogrt\Bunnys Caption.mogrt is missing next to this installer.
  pause
  exit /b 1
)

robocopy "%SRC%." "%DEST%" /MIR /XD dev tools .claude .git /XF "Install on Windows.bat" "Uninstall on Windows.bat" *.command *.log /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
  echo  ERROR: copy failed.
  pause
  exit /b 1
)

rem Unsigned panels need PlayerDebugMode (per user, CEP 11-13 = Premiere Pro / After Effects 2022-2026)
for %%v in (11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

rem Fonts the Lyrics styles use (from the Fonts folder next to the Plugin folder), installed for this user only
if exist "%SRC%..\Fonts" (
  echo  Installing fonts for the Lyrics styles...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'; New-Item -ItemType Directory -Force $d | Out-Null; $r='HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'; Get-ChildItem -LiteralPath '%SRC%..\Fonts' -File | Where-Object { $_.Extension -match '\.(ttf|otf)$' } | ForEach-Object { $t=Join-Path $d ('BunnysCaption_' + $_.Name); if (-not (Test-Path -LiteralPath $t)) { Copy-Item -LiteralPath $_.FullName $t }; $k=if ($_.Extension -eq '.otf') {'OpenType'} else {'TrueType'}; New-ItemProperty -Path $r -Name ('Bunnys Caption ' + $_.BaseName + ' (' + $k + ')') -Value $t -PropertyType String -Force | Out-Null }"
)

echo  Done. Restart Premiere Pro or After Effects, then open:
echo     Window ^> Extensions ^> Bunnys Caption
echo.
pause
