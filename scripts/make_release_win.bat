@echo off
cls
setlocal EnableDelayedExpansion
cd ..

set "baseUrl=https://storage.googleapis.com/chromium-browser-snapshots"
set "osAr=Linux_x64 Mac Win_x64"
set "toolsFold=scripts\win_tools"

echo ##############################
echo # Destreamer release builder #
echo ##############################
echo.

:: parse argument
if "%1"=="" (
    call set "arg=all"

) else (
    call set "arg=%1"
)

if "%arg%"=="all" (
    :: create zip names array
    set n=0
    for %%a in (linux mac win) do (
        call set zipAr[!n!]=%%a
        set /a n+=1
    )

    call :main %arg%
    goto :eof

) else (
    if "%arg%"=="help" (
        call :usage %0
        goto :gexit
    )

    if "%arg%"=="linux" (
        call set "osAr=Linux_x64"
        call set "zipAr[0]=linux"

        call :main %arg%
        goto :eof
    )

    if "%arg%"=="macos" (
        call set "osAr=Mac"
        call set "zipAr[0]=mac"

        call :main %arg%
        goto :eof
    )

    if "%arg%"=="win" (
        call set "osAr=Win_x64"
        call set "zipAr[0]=win"

        call :main %arg%
        goto :eof
    )

    :: high quality error screen :D
    call :usage %0
    color 17
    echo.
    echo.
    echo :(
    echo Your pc ran into a problem.
    echo.
    echo.     Stop code: INVALID_OS_SELECTED
    echo.
    goto :exitHQErrScr
)

:main
    echo Making directories...
    echo.
    call :makeDirectories

    echo Extracting puppeteer chromium revision...
    echo.
    call :getChromeRevision

    echo Building destreamer...
    echo.
    call :buildDestreamer

    echo.
    echo Downloading chromium packages...
    echo.
    call :downloadChromiumPackages

    echo.
    echo Building pkg...
    echo.

    if %1 == all (
        call :buildPkg

    ) else (
        call :buildPkgForOS %1
    )

    echo.
    echo Building destreamer release package...
    echo.
    call :buildDestreamerReleasePackages

    :: this will only delete release content, for obscure reasons
    :: windows feature :)
    rmdir /s /q release

    goto :gexit

:getChromeRevision
    setlocal

    cd release
    type ..\node_modules\puppeteer\package.json | findstr /i "chromium_revision" > revision.txt

    set /p rev=<revision.txt

    call set chromeRev=%%rev%:~26,-1%%
    echo %chromeRev%>revision.txt

    cd ..

    endlocal
    exit /b

:makeDirectories
    if exist release (
        rmdir /s /q release
    )

    mkdir release\temp
    exit /b

:buildDestreamer
    call npm run -s build
    exit /b

:downloadChromiumPackages
    setlocal EnableDelayedExpansion

    set /p rev=<release\revision.txt
    set idx=0

    for %%a in (%osAr%) do (
        call set "zipName=chrome-%%zipAr[!idx!]%%.zip"
        call set "finalUrl=%%baseUrl%%/%%a/%%rev%%/%%zipName%%"

        call %%toolsFold%%\wget.exe %%finalUrl%% -P release\temp\%%a
        call %%toolsFold%%\7za.exe x release\temp\%%a\%%zipName%% -y -orelease\temp\%%a

        set /a idx+=1
    )

    endlocal
    exit /b

:buildPkg
	call pkg . --out-path release

	cd release

	copy /y destreamer-linux temp\Linux_x64
	copy /y destreamer-macos temp\Mac
	copy /y destreamer-win.exe temp\Win_x64

    exit /b

:buildPkgForOS
    call pkg -t %1 . --out-path release

    cd release
    call copy /y destreamer* temp\%%osAr%%

    exit /b

:buildDestreamerReleasePackages
    setlocal EnableDelayedExpansion

    set /p rev=<revision.txt
    set idx=0

    for %%a in (%osAr%) do (
        call set "chromeFold=chrome-%%zipAr[!idx!]%%"
        call set "osFold=%%zipAr[!idx!]%%-%%rev%%"

        :: windows fix
        if "%%a" == "Win_x64" (
            call set "osFold=win64-%%rev%%"
        )

        cd temp\%%a
        call mkdir chromium\%%osFold%%
        call move /y %%chromeFold%% chromium\%%osFold%%
        call ..\..\..\%%toolsFold%%\7za.exe a destreamer-%%a.zip chromium destreamer*
        call move /y destreamer-%%a.zip ..\..\..
        cd ..\..

        set /a idx+=1
    )

    endlocal

    cd ..
    exit /b

:usage
	echo Usage: %1 [option]
    echo.
	echo.  help  - Show usage
	echo.  linux - Build for Linux x64
	echo.  win   - Build for Windows x64
	echo.  macos - Build for MacOS x64
	echo.  all   - Build all
    echo.
	echo  default: all

    exit /b

:exitHQErrScr
    pause
    color 07
    goto :eof

:gexit
    pause

:eof