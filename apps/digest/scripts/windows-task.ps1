# Registers (or removes) a daily Windows Task Scheduler job that runs the digest on this machine.
# Stop-gap for when GitHub Actions cannot run (minutes quota used up). Remove it once the Actions cron
# runs again: the two runners keep separate state, so they would send the same vacancies twice.
#
# Secrets: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the repo-root .env (git-ignored, see .env.example),
# loaded by Node's --env-file. The script only checks that the file exists; it never reads or prints it.
#
#   powershell -ExecutionPolicy Bypass -File apps/digest/scripts/windows-task.ps1 [-At 09:00]
#   powershell -ExecutionPolicy Bypass -File apps/digest/scripts/windows-task.ps1 -Unregister
param(
  [string]$At = '09:00',
  [switch]$Unregister
)
$ErrorActionPreference = 'Stop'
$name = 'Applyra digest'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  "Removed '$name'."
  return
}

$dir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path -LiteralPath (Join-Path $dir '..\..\.env'))) {
  throw 'Create the repo-root .env (see .env.example) with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first.'
}
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
New-Item -ItemType Directory -Force -Path (Join-Path $dir '.state') | Out-Null

# cmd /s /c "<line>": the outer quotes are stripped, the quoted node path survives; output appends to the log.
$line = "`"$node`" --env-file=../../.env src/main.ts --source=dou,djinni >> .state\local.log 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/d /s /c `"$line`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Applyra: daily vacancy digest to Telegram (local stop-gap for the GitHub Actions cron)' -Force | Out-Null

"Registered '$name': daily at $At; a run missed while the machine was off starts when it is back."
"Log: $dir\.state\local.log"
"Run it now:  Start-ScheduledTask -TaskName '$name'"
