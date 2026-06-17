# setup-cron-windows.ps1
# Run once as Administrator to schedule nightly YouTube knowledge fetch
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-cron-windows.ps1

$TaskName   = "HirobusYoutubeKnowledge"
$WslDistro  = "Ubuntu"
$ProjectDir = "/home/adrian/projects/adrian-milsap"
$LogFile    = "/tmp/youtube-knowledge-cron.log"

# Build the WSL command
$Action = New-ScheduledTaskAction `
  -Execute "wsl.exe" `
  -Argument "-d $WslDistro -- bash -c `"cd $ProjectDir && node scripts/youtube-knowledge.mjs >> $LogFile 2>&1`""

# Run at 5am daily (before morning session, computer may be off — StartWhenAvailable handles wake/resume)
$Trigger  = New-ScheduledTaskTrigger -Daily -At "5:00AM"
$TriggerS = New-ScheduledTaskTrigger -AtStartup  # also catch cold-boot runs

# Run whether user is logged in or not
$Settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -StartWhenAvailable `
  -WakeToRun

$Principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive

# Register the task (dual trigger: 5am + startup catchup)
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger @($Trigger, $TriggerS) `
  -Settings $Settings `
  -Principal $Principal `
  -Force

Write-Host "✅ Scheduled task '$TaskName' created — runs at 5am daily + on startup (catchup)"
Write-Host "   View in Task Scheduler > Task Scheduler Library"
Write-Host "   Log: wsl cat $LogFile"
