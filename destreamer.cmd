@ECHO OFF

node.exe --version | findstr "v8."
IF %ERRORLEVEL% EQU 0 GOTO Node8

node.exe --max-http-header-size 32768 build\src\destreamer.js %*
GOTO :End

:Node8
node.exe build\src\destreamer.js %*

:End