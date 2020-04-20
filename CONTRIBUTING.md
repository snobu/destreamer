## TO DO

// Add instructions on how to setup your dev environment for destreamer

## Build a release

Destreamer builder supports the following environments:
* Linux
* WLS (Windows Linux Subsystem)
* MacOS
* Windows

Requirements
* [pkg](https://www.npmjs.com/package/pkg)
* git
* wget (Linux / macOS)

`Install pkg to your system with the command:`
```
npm i -g pkg
```

You will find your release package in destreamer root directory.

To build a release package, run the following commands:
* `npm install`
* `cd scripts`

on Linux / WLS / macOS:
* `$ chmod +x make_release.sh`
* `$ ./make_release.sh`

on Windows:
* `make_release_win.bat`

## Help
```
Usage: make_realse [option]

 help  - Show usage
 linux - Build for Linux x64
 win   - Build for Windows x64
 macos - Build for MacOS x64
 all   - Build all

 default: all
```