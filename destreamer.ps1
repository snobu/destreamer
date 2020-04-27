$NodeVersion = Invoke-Expression "node.exe --version"
if ($NodeVersion.StartsWith("v8.")) {
    node.exe build\src\destreamer.js $args
}
else {
    node.exe --max-http-header-size 32768 build\src\destreamer.js $args
}

