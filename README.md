# Destreamer

<a href="https://github.com/snobu/destreamer/actions">
  <img src="https://github.com/snobu/destreamer/workflows/Node%20CI/badge.svg" alt="CI build status" />
</a>

![](logo.png)

## Saves Microsoft Stream videos for offline enjoyment.

Alpha-quality, don't expect much. It does work though, so that's a neat feature.

It's slow (e.g. a 60-min video takes 20-30 minutes to download). Not much i can do about it for now unless i find a better way than ripping HLS.

## NEWS

- We now have a token cache so we can reuse access tokens for their one hour lifetime. What this really means is that within one hour you only need to login via the popup browser once.

## This project is now looking for contributors
<img src="https://www.whitesourcesoftware.com/wp-content/uploads/2018/02/10-github-to-follow.jpg" width=400 />

Roadmap -
- [X] Token cache (so you don't have to log in every time you run destreamer)
- [ ] Download closed captions if available
- [ ] Performance improvements (via aria2c maybe?) // _This is under consideration, we're not sure if this borders on abusing the streaming endpoints or not._
- [ ] Single static binary (for each major OS)

Send a quality PR first and i'll add you as a contributor to the repository.

## DISCLAIMER

Hopefully this doesn't break the end user agreement for Microsoft Stream. Since we're simply saving the HLS stream to disk as if we were a browser, this does not abuse the streaming endpoints. However i take no responsibility if either Microsoft or your Office 365 admins request a chat with you in a small white room.

## PREREQS

* **Node.js**: anything above v8.0 seems to work. A GitHub Action runs tests on all major Node versions on every commit.
* **ffmpeg**: a recent version (year 2019 or above), in `$PATH` or in the same directory as `destreamer.ts`.

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

## RANDOM NOTE

Just ignore this error, we already have what we need to start the download, no time to deal with collaterals -

![image](https://user-images.githubusercontent.com/6472374/77905069-4c585000-728e-11ea-914e-26f1ce5e595b.png)


## EXPECTED OUTPUT

```
<<<< OUTPUT >>>>
```

The video is now saved under `videos/`, or the path from `--outputDirectory`.