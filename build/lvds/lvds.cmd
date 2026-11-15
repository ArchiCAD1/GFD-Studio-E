@echo off
rem The lvds command of the installed app (command line, MCP server, local API): lvds help
rem Runs lvds.mjs, beside this file, with the app itself as its Node runtime (ELECTRON_RUN_AS_NODE):
rem no window opens and no separate Node is needed.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\LV Design Studio.exe" "%~dp0lvds.mjs" %*
exit /b %ERRORLEVEL%
