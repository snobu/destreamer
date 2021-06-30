$NodeVersion = Invoke-Expression "node.exe --version"
$JSScriptPath = "\build\src\destreamer.js"
$ScriptPath = "$PSScriptRoot$JSScriptPath"

if ($NodeVersion.StartsWith("v8.")) {
    & "node.exe $ScriptPath $args"
}
else {
    node.exe --max-http-header-size 32768 $ScriptPath $args
}