# Destreamer

<a href="https://github.com/snobu/destreamer/actions">
  <img src="https://github.com/snobu/destreamer/workflows/Node%20CI/badge.svg" alt="CI build status" />
</a>

![](logo.png)

## Saves Microsoft Stream videos for offline enjoyment.

Alpha-quality, don't expect much. It does work though, so that's a neat feature.

It's slow (e.g. a 60-min video takes 20-30 minutes to download). Not much i can do about it for now unless i find a better way than ripping HLS.

## This project is now looking for contributors
<img src="https://www.whitesourcesoftware.com/wp-content/uploads/2018/02/10-github-to-follow.jpg" width=400 />

Roadmap -
- [ ] Token cache (so you don't have to log in every time you run destreamer)
- [ ] Download closed captions if available
- [ ] Performance improvements (via aria2c maybe?)
- [ ] Single static binary (for each major OS)

Send a quality PR first and i'll add you as a contributor to the repository.

## DISCLAIMER

Hopefully this doesn't break the end user agreement for Microsoft Stream. Since we're simply saving the HLS stream to disk as if we were a browser, this does not abuse the streaming endpoints. However i take no responsibility if either Microsoft or your Office 365 admins request a chat with you in a small white room.


## PREREQS

* **Node.js**: anything above v8.0 seems to work. A GitHub Action runs tests on all major Node versions on every commit.
* **youtube-dl**: https://ytdl-org.github.io/youtube-dl/download.html, you'll need a fairly recent version that understands encrypted HLS streams. This needs to be in your $PATH. Destreamer calls `youtube-dl` with a bunch of arguments.
* **ffmpeg**: a recent version (year 2019 or above), in `$PATH`.

Destreamer takes a [honeybadger](https://www.youtube.com/watch?v=4r7wHMg5Yjg) approach towards the OS it's running on, tested on Windows, results may vary, feel free to open an issue if trouble arise.

## USAGE

* `npm install` to restore packages
* `npm run -s build` to transpile TypeScript to JavaScript

```
$ node ./destreamer.js

Options:
  --help             Show help                                         [boolean]
  --version          Show version number                               [boolean]
  --videoUrls                                                 [array] [required]
  --username                                                            [string]
  --outputDirectory                                 [string] [default: "videos"]
  --format, -f       Expose youtube-dl --format option, for details see

                     https://github.com/ytdl-org/youtube-dl/blob/master/README.m
                     d#format-selection                                 [string]
  --simulate, -s     If this is set to true no video will be downloaded and the
                     script
                     will log the video info (default: false)
                                                      [boolean] [default: false]
  --verbose, -v      Print additional information to the console
                     (use this before opening an issue on GitHub)
                                                      [boolean] [default: false]


$ node destreamer.js --username username@example.com --outputDirectory "videos" \
    --videoUrls "https://web.microsoftstream.com/video/VIDEO-1" \
                "https://web.microsoftstream.com/video/VIDEO-2" \
                "https://web.microsoftstream.com/video/VIDEO-3"
```
Passing `--username` is optional. It's there to make logging in faster (the username field will be populated automatically on the login form).

You can use an absolute path for `--outputDirectory`, for example `/mnt/videos`.

Your video URLs **must** include the URL schema (the leading `https://`).

To choose preferred video format and quality you can use the `-f` (`--format`) option. It exposes a native [`youtube-dl` parameter][4].
If you do not pass this parameter then `youtube-dl` will download the best available quality for each video.

## IMPORTANT NOTE
For now you need to keep the puppeteer browser window open (the one that pops up for logging in) if you download more than one video in one go.

Also, just ignore this error, we already have what we need to start the download, no time to deal with collaterals -

![image](https://user-images.githubusercontent.com/6472374/77905069-4c585000-728e-11ea-914e-26f1ce5e595b.png)


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



[4]: https://github.com/ytdl-org/youtube-dl/blob/master/README.md#format-selection
