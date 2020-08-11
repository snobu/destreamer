
# WAIT! Is an University of Parma Fork!
I made this fork to allow people studying at the university of Parma to download files and permit students to enter their private university profile directly, without inserting their personal data every time. Unlike the main program, the access credentials to the unipr portal must be saved in the program root in a "credentials.txt" file following this format (1 string per line):
```
yourUserWithout@studenti.unipr.it
yourMagicPassword
```
***You are storing plaintext-credentials, therefore pay attention!*** _(i will fix that later, i promise...!)_					 
You can find the original work [here](https://github.com/snobu/destreamer), if you find any issue please submit to him.

### Little trick 
If you have to download lots of files, you can create a python script to keep working after crash without doing any action. Of course you have to manually stop it with ctrl+z, or it will run forever!

```python
#!/usr/bin/env python3

import os
import sys

string = ""
filename = os.path.basename(__file__)
for arg in sys.argv:
	if (arg != "python" and arg!="python3" and arg!= "./"+filename and arg!= filename):
		string+= (arg+" ")

print('''\n\nRunning forever-plugin for destreamer! 
I will keep working after crash!
You are running with this arguments: {}

Remember to close with ctrl+z, or i will run forever!\n\n'''.format(string))

while True:
	os.system("./destreamer.sh "+string)
```
Create a file.py with the name you want (suggested forever.py....) and run the script with the desidered arguments like the main program.

In addiction i raccomend to use: 
```bash
./destreamer.sh -f list.txt -O ./desidered/folder --format mp4 --skip
```
or
```bash
python3 ./forever.py -f list.txt -O ./desidered/folder --format mp4 --skip
```

<a href="https://github.com/snobu/destreamer/actions">
  <img src="https://github.com/snobu/destreamer/workflows/Node%20CI/badge.svg" alt="CI build status" />
</a>

![destreamer](assets/logo.png)

_(Alternative artwork proposals are welcome! Submit one through an Issue.)_

# Saves Microsoft Stream videos for offline enjoyment

### v2.0 Release, codename _Hammer of Dawn<sup>TM</sup>_

This release would not have been possible without the code and time contributed by two distinguished developers: [@lukaarma](https://github.com/lukaarma) and [@kylon](https://github.com/kylon). Thank you!

[Politecnico di Milano][polisite] students may want to use this fork over at https://github.com/SamanFekri/destreamer which is a specialized implementation of this project with automatic logon.

## Outstanding bugs

- We couldn't yet find an elegant way to refresh the access token, so you'll need to perform an interactive logon every hour or so. We're still at the drawing board on this one.

## What's new

- Major code refactoring
- Dramatically improved error handling
- We now have a token cache so we can reuse access tokens. This really means that within one hour you need to perform the interactive browser login only once.
- We removed the dependency on `youtube-dl`
- Getting to the HLS URL is dramatically more reliable as we dropped parsing the DOM for the video element in favor of calling the Microsoft Stream API
- Fixed a major 2FA bug that would sometimes cause a timeout in our code
- Fixed a wide variety of other bugs, maybe introduced a few new ones :)

## Disclaimer

Hopefully this doesn't break the end user agreement for Microsoft Stream. Since we're simply saving the HLS stream to disk as if we were a browser, this does not abuse the streaming endpoints. However i take no responsibility if either Microsoft or your Office 365 admins request a chat with you in a small white room.

## Prereqs

- [**Node.js**][node]: You'll need Node.js version 8.0 or higher. A GitHub Action runs tests on all major Node versions on every commit. One caveat for Node 8, if you get a `Parse Error` with `code: HPE_HEADER_OVERFLOW` you're out of luck and you'll need to upgrade to Node 10+.
- **npm**: usually comes with Node.js, type `npm` in your terminal to check for its presence
- [**ffmpeg**][ffmpeg]: a recent version (year 2019 or above), in `$PATH` or in the same directory as this README file (project root).
- [**git**][git]: one or more npm dependencies require git.

Destreamer takes a [honeybadger](https://www.youtube.com/watch?v=4r7wHMg5Yjg) approach towards the OS it's running on. We've successfully tested it on Windows, macOS and Linux.

## Limits and limitations

Make sure you use the right script (`.sh`, `.ps1` or `.cmd`) and escape char (if using line breaks) for your shell.
PowerShell uses a backtick [ **`** ] and cmd.exe uses a caret [ **^** ].

Note that destreamer won't run in an elevated (Administrator/root) shell. Running inside **Cygwin/MinGW/MSYS** may also fail, please use **cmd.exe** or **PowerShell** if you're on Windows.

**WSL** (Windows Subsystem for Linux) is not supported as it can't easily pop up a browser window. It *may* work by installing an X Window server (like [Xming][xming]) and exporting the default display to it (`export DISPLAY=:0`) before running destreamer. See [this issue for more on WSL v1 and v2][wsl].

## How to build

To build destreamer clone this repository, install dependencies and run the build script -

```sh
$ git clone https://github.com/vRuslan/destreamer-unipr
$ cd ./destreamer-unipr
$ npm install
$ npm run build
```
Then create in the program root folder the credentials.txt file with at the first line the username and in the second one the password.
```
yourUserWithout@studenti.unipr.it
yourMagicPassword
```
***You are storing plaintext-credentials, therefore pay attention!***

## Usage

```
$ ./destreamer.sh

Options:
  --help                   Show help                                   [boolean]
  --version                Show version number                         [boolean]
  --videoUrls, -i          List of video urls                            [array]
  --videoUrlsFile, -f      Path to txt file containing the urls         [string]
  --username, -u                                                        [string]
  --outputDirectory, -o    The directory where destreamer will save your
                           downloads [default: videos]                  [string]
  --outputDirectories, -O  Path to a txt file containing one output directory
                           per video                                    [string]
  --noExperiments, -x      Do not attempt to render video thumbnails in the
                           console                    [boolean] [default: false]
  --simulate, -s           Disable video download and print metadata information
                           to the console             [boolean] [default: false]
  --verbose, -v            Print additional information to the console (use this
                           before opening an issue on GitHub)
                                                      [boolean] [default: false]
  --noCleanup, --nc        Don't delete the downloaded video file when an FFmpeg
                           error occurs               [boolean] [default: false]
  --vcodec                 Re-encode video track. Specify FFmpeg codec (e.g.
                           libx265) or set to "none" to disable video.
                                                      [string] [default: "copy"]
  --acodec                 Re-encode audio track. Specify FFmpeg codec (e.g.
                           libopus) or set to "none" to disable audio.
                                                      [string] [default: "copy"]
  --format                 Output container format (mkv, mp4, mov, anything that
                           FFmpeg supports)            [string] [default: "mkv"]
  --skip                   Skip download if file already exists
                                                      [boolean] [default: false]
```

We default to `.mkv` for the output container. If you prefer something else (like `mp4`), pass `--format mp4`.

Download a video -
```sh
$ ./destreamer.sh -i "https://web.microsoftstream.com/video/VIDEO-1"
```

Download a video and re-encode with HEVC (libx265):
```sh
$ ./destreamer.sh -i "https://web.microsoftstream.com/video/VIDEO-1" --vcodec libx265
```

Download a video and speed up the interactive login by automagically filling in the username -
```sh
$ ./destreamer.sh -u user@example.com -i "https://web.microsoftstream.com/video/VIDEO-1"
```

Download a video to a custom path -
```sh
$ ./destreamer.sh -i "https://web.microsoftstream.com/video/VIDEO-1" -o /Users/hacker/Downloads
```

Download two or more videos -
```sh
$ ./destreamer.sh -i "https://web.microsoftstream.com/video/VIDEO-1" \
                     "https://web.microsoftstream.com/video/VIDEO-2"
```

Download many videos but read URLs from a file -
```sh
$ ./destreamer.sh -f list.txt
```

You can create a `.txt` file containing your video URLs, one video per line. The text file can have any name, followed by the `.txt` extension.

Passing `--username` is optional. It's there to make logging in faster (the username field will be populated automatically on the login form).

You can use an absolute path for `-o` (output directory), for example `/mnt/videos`.

## Expected output

Windows Terminal -

![screenshot](assets/screenshot-win.png)

iTerm2 on a Mac -

![screenshot](assets/screenshot-mac.png)

By default, downloads are saved under `videos/` unless specified by `-o` (output directory).

## Contributing

Contributions are welcome. Open an issue first before sending in a pull request. All pull requests require at least one code review before they are merged to master.

## Found a bug?

Please open an [issue](https://github.com/snobu/destreamer/issues) and we'll look into it.


[ffmpeg]: https://www.ffmpeg.org/download.html
[xming]: https://sourceforge.net/projects/xming/
[node]: https://nodejs.org/en/download/
[git]: https://git-scm.com/downloads
[wsl]: https://github.com/snobu/destreamer/issues/90#issuecomment-619377950
[polisite]: https://www.polimi.it
