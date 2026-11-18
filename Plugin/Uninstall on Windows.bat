@echo off
rem Removes the Bunnys Caption panel. Your saved presets in %%APPDATA%%\BunnysFramelab are kept.
rmdir /s /q "%APPDATA%\Adobe\CEP\extensions\com.bunnysframelab.caption"
echo Bunnys Caption removed. Presets are still in %APPDATA%\BunnysFramelab\BunnysCaption
pause
