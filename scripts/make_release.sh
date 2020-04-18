#!/bin/bash
set -euo pipefail
cd ..

# vars
chromeRev=`cat node_modules/puppeteer/package.json | grep chromium_revision | grep -oP '"([0-9]+)"' | cut -d"\"" -f2`
baseUrl="https://storage.googleapis.com/chromium-browser-snapshots"
osAr=("Linux_x64" "Mac" "Win_x64")
zipAr=("linux" "mac" "win")
arg="all"

function checkWget() {
	command -v wget >/dev/null 2>&1 || { echo -e >&2 "I need wget to work :(\n"; exit 1; }
}

function setupBuildForOS() {
	case "$arg" in
		"linux")
			osAr=("Linux_x64")
			zipAr=("linux")
			;;
		"win")
			osAr=("Win_x64")
			zipAr=("win")
			;;
		"macos")
			osAr=("Mac")
			zipAr=("mac")
			;;
		*)
			echo -e "\nInvalid OS selected!\n"
			exit 1
			;;
	esac;
}

function makeDirectories() {
	if [ -d release ]; then
		rm -R release
	fi

	mkdir -p release/temp
}

function buildDestreamer() {
	npm run -s build
}

function downloadChromiumPackages() {
	local idx=0

	for os in "${osAr[@]}"
	do
		local zipName="chrome-${zipAr[$idx]}.zip"
		local finalUrl="$baseUrl/$os/$chromeRev/$zipName"

		wget "$finalUrl" -P "release/temp/$os"
		unzip "release/temp/$os/$zipName" -d "release/temp/$os"

		((++idx))
	done;
}

function buildPkg() {
	pkg . --out-path release

	cd release

	cp destreamer-linux temp/Linux_x64
	cp destreamer-macos temp/Mac
	cp destreamer-win.exe temp/Win_x64
}

function buildPkgForOS() {
	pkg -t "$arg" . --out-path release

	cd release

	cp destreamer* "temp/${osAr[0]}"
}

function buildDestreamerReleasePackages() {
	local idx=0

	for os in "${osAr[@]}"
	do
	    local chromeFold="chrome-${zipAr[$idx]}"
		local osFolder="${zipAr[$idx]}-$chromeRev"

		if [[ "$os" == "Win_x64" ]]; then # windows fix
			osFolder="win64-$chromeRev"
		fi;

		cd "temp/$os"
		mkdir -p "chromium/$osFolder"
		mv "$chromeFold" "chromium/$osFolder"
		zip -r "destreamer-$os.zip" chromium destreamer*
		mv "destreamer-$os.zip" ../../..
		cd ../..

		((++idx))
	done;

	cd ..
}

function usage() {
	echo -e "Usage: $0 [option]\n"
	echo " help  - Show usage"
	echo " linux - Build for Linux x64"
	echo " win   - Build for Windows x64"
	echo " macos - Build for MacOS x64"
	echo " all   - Build all"
	echo -e "\n default: all\n"
}

function parseArgument() {
	case "$arg" in
		"all")
			;;
		"linux"|"win"|"macos")
			setupBuildForOS
			;;
		*)
			usage
			exit 0
			;;
	esac;
}

function main() {
	clear

	echo    "##############################"
	echo    "# Destreamer release builder #"
	echo -e "##############################\n"

	parseArgument
	checkWget

	echo -e "\n> \e[32mMaking directories...\e[39m"
	makeDirectories

	echo -e "\n> \e[32mBuilding destreamer...\e[39m"
	buildDestreamer

	echo -e "\n> \e[32mDownloading chromium packages...\e[39m"
	downloadChromiumPackages

	echo -e "\n> \e[32mBuilding pkg...\e[39m"
	if [[ "$arg" == "all" ]]; then
		buildPkg
	else
		buildPkgForOS
	fi;

	echo -e "\n> \e[32mBuilding destreamer release package\e[39m"
	buildDestreamerReleasePackages

	rm -R release
	exit 0
}

# run
if [[ $# -gt 0 ]]; then
	arg="$1"
fi;

main
