# Deny tool calls that reload or kill the Cursor window.
# Page.reload on the built-in browser reloads the workbench, which stops every chat.
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

function Write-Allow {
  [Console]::Out.WriteLine('{"permission":"allow"}')
  exit 0
}

function Write-Deny([string]$agentMessage) {
  $payload = @{
    permission    = 'deny'
    user_message  = 'Blocked a Cursor window reload so open chats keep running.'
    agent_message = $agentMessage
  }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
  exit 0
}

# $input is only populated for the script itself, not for a function.
$raw = -join @($input)
if ([string]::IsNullOrWhiteSpace($raw) -and [Console]::IsInputRedirected) {
  $raw = [Console]::In.ReadToEnd()
}

function Test-PageReloadNode($node, [int]$depth) {
  if ($null -eq $node -or $depth -gt 12) { return $false }

  if ($node -is [string]) {
    $trim = $node.TrimStart()
    if ($trim.StartsWith('{') -or $trim.StartsWith('[')) {
      try {
        return Test-PageReloadNode ($node | ConvertFrom-Json) ($depth + 1)
      } catch {
        return $false
      }
    }
    return $false
  }

  if ($node -is [System.Array]) {
    foreach ($item in $node) {
      if (Test-PageReloadNode $item ($depth + 1)) { return $true }
    }
    return $false
  }

  foreach ($prop in @($node.PSObject.Properties)) {
    if ($prop.Name -eq 'method' -and [string]$prop.Value -eq 'Page.reload') { return $true }
    if (Test-PageReloadNode $prop.Value ($depth + 1)) { return $true }
  }
  return $false
}

function Test-ShellRestart([string]$command) {
  if ([string]::IsNullOrWhiteSpace($command)) { return $false }
  if ($command -match 'workbench\.action\.(reloadWindow|restartExtensionHost)') { return $true }
  if ($command -match 'Developer:\s*Reload Window') { return $true }
  if ($command -match '(?i)\b(taskkill|Stop-Process|kill|tskill)\b' -and $command -match '(?i)\bCursor(\.exe)?\b') { return $true }
  return $false
}

$denyPage = 'Denied. browser_cdp Page.reload reloads the entire Cursor window and stops every open chat. Refresh the built-in browser with browser_navigate to the same URL. Do not call Page.reload again.'
$denyShell = 'Denied. This command reloads or kills Cursor and stops every open chat. Do not run it.'

try {
  if ([string]::IsNullOrWhiteSpace($raw)) { Write-Allow }
  $payload = $raw | ConvertFrom-Json

  $command = ''
  if ($payload.PSObject.Properties.Name -contains 'command') {
    $command = [string]$payload.command
  }

  if (Test-ShellRestart $command) { Write-Deny $denyShell }
  if (Test-PageReloadNode $payload 0) { Write-Deny $denyPage }
  Write-Allow
} catch {
  if ($raw -match '"method"\s*:\s*"Page\.reload"' -or $raw -match 'workbench\.action\.(reloadWindow|restartExtensionHost)') {
    Write-Deny $denyPage
  }
  Write-Allow
}
