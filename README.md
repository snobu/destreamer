# Destreamer

![](logo.png)

## Saves Microsoft Stream videos for offline enjoyment.

Alpha-quality, don't expect much. It does work though, so that's a neat feature.

It's slow (e.g. a 60-min video takes 20-30 minutes to download). Not much i can do about it for now unless i find a better way than ripping HLS.

## NEW `dev` BRANCH!

This is now a TypeScript project if you checkout the `dev` branch.
All new development happens on `dev` branch.

Use the `master` branch for the older vanilla JavaScript version.

## DISCLAIMER

Hopefully this doesn't break the end user agreement for Microsoft Stream. Since we're simply saving the HLS stream to disk as if we were a browser, this does not abuse the streaming endpoints. However i take no responsibility if either Microsoft or your Office 365 admins request a chat with you in a small white room.


## PREREQS

* **Node.js**: anything above v8.0 seems to work. A GitHub Action runs tests on Node 8, 10 and 12 on every commit.
* **youtube-dl**: https://ytdl-org.github.io/youtube-dl/download.html, you'll need a fairly recent version that understands encrypted HLS streams. This needs to be in your $PATH. Destreamer calls `youtube-dl` with a bunch of arguments.
* **ffmpeg**: a recent version (year 2019 or above), in `$PATH`.

Destreamer takes a [honeybadger](https://www.youtube.com/watch?v=4r7wHMg5Yjg) approach towards the OS it's running on, tested on Windows, results may vary, feel free to open an issue if trouble arise.

## USAGE

* Edit `destreamer.ts` and replace the username const with your own, you may still need to enter your password or go through 2FA if you don't have the STS cookie saved in Chrome. If you do (i.e. you usually log in to Microsoft Stream with Chrome), then you may try turning `headless: false` to `true` for a truly headless experience)
* To choose preferred video format and quality you can use the "--format" option, it doesn't add anyting new, it only expose a native youtube-dl option, you can find details about accepted parameters on official youtube-dl README here ===> [FORMAT SELECTION](https://github.com/ytdl-org/youtube-dl/blob/master/README.md#format-selection)
If you do not pass any option it will download the best available quality by default.
=======
* Edit `destreamer.ts` (`.js` if using the vanilla JS master branch) and replace the username const with your own, you may still need to enter your password or go through 2FA if you don't have the STS cookie saved in Chrome. If you do (i.e. you usually log in to Microsoft Stream with Chrome), then you may try turning `headless: false` to `true` for a truly headless experience)
* `npm install` to restore packages* `npm install` to restore packages
* `npm run -s build` to transpile TypeScript to JavaScript

```
$ node ./destreamer.js

Options:
  --help             Show help                                         [boolean]
  --version          Show version number                               [boolean]
  --videoUrls                                                 [array] [required]
  --username                                                 [string] [required]
  --outputDirectory                                 [string] [default: "videos"]
  --format, -f       Expose youtube-dl --format option, for details see
                     https://github.com/ytdl-org/youtube-dl/blob/master/README.m
                     d#format-selection               [string] [default: "best"]


$ node destreamer.js --username username@example.com --outputDirectory "videos" \
    --videoUrls "https://web.microsoftstream.com/video/VIDEO-1" \
                "https://web.microsoftstream.com/video/VIDEO-2" \
                "https://web.microsoftstream.com/video/VIDEO-3"
```
You can use an absolute path for `--outputDirectory`, for example `/mnt/videos`.

### To download a list of videos

~~There's no implementation that does that (yet). There's some work happening to support this, give it some time.~~
See usage above.

## EXPECTED OUTPUT

```
Using youtube-dl version 2019.01.17
Launching headless Chrome to perform the OpenID Connect dance...

Navigating to STS login page...
We are logged in. Sorry, i mean "you".
Got cookie. Consuming cookie...
Looking up AMS stream locator...
Video title is: Mondays with IGD 11th March-2019
At this point Chrome's job is done, shutting it down...
Constructing HLSv3 URL...
Spawning youtube-dl with cookie and HLSv3 URL...

[generic] manifest(format=m3u8-aapl-v3): Requesting header
[generic] manifest(format=m3u8-aapl-v3): Downloading m3u8 information
[download] Destination: Mondays with IGD 11th March-2019.mp4
ffmpeg version 4.0.2 Copyright (c) 2000-2018 the FFmpeg developers
  built with gcc 7.3.1 (GCC) 20180722
  configuration: --enable-gpl --enable-version3 --enable-sdl2 --enable-bzlib 

[...]

frame= 8435 fps= 67 q=-1.0 Lsize=  192018kB time=00:05:37.38 bitrate=4662.3kbits/s speed=2.68x
video:186494kB audio:5380kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: 0.074759%
[ffmpeg] Downloaded 196626728 bytes
[download] Download completed
```

The video is now saved under `videos/`, or whatever the `outputDirectory` const points to.


## _IT JUST KEEPS CRASHING FOR ME!_
Check out this issue if it keeps crashing for you -
https://github.com/snobu/destreamer/issues/6
