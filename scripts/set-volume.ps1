param([int]$targetPercent)

# Use WScript.Shell SendKeys to adjust volume
# 174 = Volume Down, 175 = Volume Up, 173 = Mute
$wsh = New-Object -ComObject WScript.Shell

# First mute or bring down to 0 by pressing volume down 50 times (each step is 2%)
for ($i = 0; $i -lt 50; $i++) {
    $wsh.SendKeys([char]174)
}

# Now press volume up to reach target percentage ($targetPercent / 2)
$stepsUp = [math]::Round($targetPercent / 2)
for ($i = 0; $i -lt $stepsUp; $i++) {
    $wsh.SendKeys([char]175)
}

Write-Output "Volume set to approximately $targetPercent%"
