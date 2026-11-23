@echo off
rem The gfde command of the installed app (command line, MCP server, local API): gfde help
rem Runs gfde.mjs, beside this file, with the app itself as its Node runtime (ELECTRON_RUN_AS_NODE):
rem no window opens and no separate Node is needed.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\GFD Studio E.exe" "%~dp0gfde.mjs" %*
exit /b %ERRORLEVEL%
