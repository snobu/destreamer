# Destreamer

<a href="https://github.com/snobu/destreamer/actions">
  <img src="https://github.com/snobu/destreamer/workflows/Node%20CI/badge.svg" alt="CI build status" />
</a>

![](logo.png)

## Saves Microsoft Stream videos for offline enjoyment

## HOW TO BUILD FOR RELEASE
Destreamer builder supports the following environments:
* Linux
* WLS (Windows Linux Subsystem)
* MacOS

Requirements
* [pkg](https://www.npmjs.com/package/pkg)
* wget

`Install pkg to your system with the command:`
```
npm i -g pkg
```

You will find your release package in destreamer root directory.

To build a release package, run the following commands:
* `$ npm install`
* `$ cd scripts`
* `$ chmod +x make_release.sh`
* `$ ./make_release.sh`

```
Usage: ./make_realse.sh [option]

 help  - Show usage
 linux - Build for Linux x64
 win   - Build for Windows x64
 macos - Build for MacOS x64
 all   - Build all

 default: all
```