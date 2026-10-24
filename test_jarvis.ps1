param(
  [string]$BaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
$script:FailedChecks = 0
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseUri = [Uri]$BaseUrl.TrimEnd('/')

function Invoke-Check {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  try {
    & $Action
    Write-Host "[OK]   $Name" -ForegroundColor Green
  } catch {
    $script:FailedChecks += 1
    Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
  }
}

function Get-JarvisResponse {
  param([string]$Path)

  $request = @{
    Uri = "$($baseUri.AbsoluteUri.TrimEnd('/'))$Path"
    TimeoutSec = 5
    UseBasicParsing = $true
  }

  $password = [Environment]::GetEnvironmentVariable('JARVIS_PASSWORD')
  if ($password) {
    $username = [Environment]::GetEnvironmentVariable('JARVIS_USERNAME')
    if (-not $username) {
      $username = 'jarvis'
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes("${username}:$password")
    $token = [Convert]::ToBase64String($bytes)
    $request.Headers = @{ Authorization = "Basic $token" }
  }

  Invoke-WebRequest @request
}

Write-Host "Checking JARVIS at $($baseUri.AbsoluteUri)" -ForegroundColor Cyan

Invoke-Check 'Python available' {
  $null = Get-Command python -ErrorAction Stop
}

Invoke-Check 'Python backend syntax' {
  Push-Location $projectRoot
  try {
    & python -m py_compile (Join-Path $projectRoot 'assistant_app.py')
    if ($LASTEXITCODE -ne 0) {
      throw "python exited with code $LASTEXITCODE"
    }
    & python -m py_compile (Join-Path $projectRoot 'create_elevenlabs_voice.py')
    if ($LASTEXITCODE -ne 0) {
      throw "python exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Invoke-Check 'JavaScript available and syntax valid' {
  $null = Get-Command node -ErrorAction Stop
  & node --check (Join-Path $projectRoot 'script.js')
  if ($LASTEXITCODE -ne 0) {
    throw "node exited with code $LASTEXITCODE"
  }
}

Invoke-Check 'Home page responds and contains the core' {
  $response = Get-JarvisResponse '/'
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'hudCanvas') {
    throw 'The page did not respond correctly or the particle core was not found.'
  }
}

Invoke-Check 'Voice recognition code is available' {
  $response = Get-JarvisResponse '/script.js'
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'SpeechRecognition') {
    throw 'JavaScript did not respond or does not contain speech recognition.'
  }
  if ($response.Content -notmatch 'voiceInputButton') {
    throw 'The microphone button was not found in the JavaScript.'
  }
}

Invoke-Check '3D interface styles are available' {
  $response = Get-JarvisResponse '/style.css'
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'core-orbit') {
    throw 'CSS did not respond or the 3D orbital rings were not found.'
  }
}

$apiCollections = @('/api/tasks', '/api/notes', '/api/reminders', '/api/projects')
foreach ($path in $apiCollections) {
  Invoke-Check "API $path returns a JSON list" {
    $response = Get-JarvisResponse $path
    $json = $response.Content.TrimStart()
    if ($response.StatusCode -ne 200 -or -not $json.StartsWith('[')) {
      throw 'The response is not a valid JSON list.'
    }
    $null = $json | ConvertFrom-Json
  }
}

Invoke-Check 'Status API responds' {
  $response = Get-JarvisResponse '/api/status'
  $status = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -ne 200 -or -not $status.provider -or -not $status.model) {
    throw 'The status response is incomplete.'
  }
  Write-Host "       Provider: $($status.provider) - Model: $($status.model)" -ForegroundColor DarkGray
}

Invoke-Check 'ElevenLabs voice status responds without exposing credentials' {
  $response = Get-JarvisResponse '/api/voice-status'
  $voiceStatus = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -ne 200 -or $null -eq $voiceStatus.configured) {
    throw 'The voice status response is incomplete.'
  }
  if ($response.Content -match 'ELEVENLABS_API_KEY|xi-api-key') {
    throw 'The voice status response must never contain API credentials.'
  }
}

Invoke-Check 'ElevenLabs setup supports a running JARVIS server' {
  $setup = Get-Content -LiteralPath (Join-Path $projectRoot 'setup_elevenlabs.ps1') -Raw
  if ($setup -notmatch '\$serverAlreadyRunning\s*=\s*\$true' -or
      $setup -notmatch 'Voice clone created' -or
      $setup -notmatch 'No audio sample will be uploaded') {
    throw 'The installer must create the voice before asking the user to restart the existing server.'
  }
}

Invoke-Check 'Overview API responds' {
  $response = Get-JarvisResponse '/api/overview'
  $overview = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -ne 200 -or $null -eq $overview.task_count -or $null -eq $overview.project_count) {
    throw 'The overview response is incomplete.'
  }
}

if ($script:FailedChecks -gt 0) {
  Write-Host "`n$script:FailedChecks check(s) failed. Confirm the server is running and try again." -ForegroundColor Red
  exit 1
}

Write-Host "`nAll checks passed. Test live microphone recognition in the browser by clicking the microphone and saying Jarvis." -ForegroundColor Green
