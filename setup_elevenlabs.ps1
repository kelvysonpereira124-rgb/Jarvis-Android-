param(
  [string]$AudioPath = 'C:\Users\Kelliane\Downloads\ElevenLabs_audio_elevenlabs-v4_[calmly] Boa no_2026-10-08T12_51_24.mp3',
  [switch]$CreateVoice,
  [string]$BaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$voiceIdPath = Join-Path $env:LOCALAPPDATA 'Jarvis\elevenlabs-voice-id.txt'
$oldApiKey = $env:ELEVENLABS_API_KEY
$oldVoiceId = $env:ELEVENLABS_VOICE_ID

try {
  $baseUri = [Uri]$BaseUrl
  $port = if ($baseUri.IsDefaultPort) { if ($baseUri.Scheme -eq 'https') { 443 } else { 80 } } else { $baseUri.Port }
  $serverAlreadyRunning = $false
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.BeginConnect($baseUri.Host, $port, $null, $null)
    if ($connect.AsyncWaitHandle.WaitOne(500)) {
      try {
        $client.EndConnect($connect)
        $serverAlreadyRunning = $true
      } catch [System.Net.Sockets.SocketException] {
      }
    }
  } finally {
    $client.Dispose()
  }

  $secureKey = Read-Host 'Enter your ElevenLabs API key (input hidden)' -AsSecureString
  $apiCredential = [System.Management.Automation.PSCredential]::new('ElevenLabs', $secureKey)
  $env:ELEVENLABS_API_KEY = $apiCredential.GetNetworkCredential().Password
  if (-not $env:ELEVENLABS_API_KEY) {
    throw 'An ElevenLabs API key is required.'
  }

  $voiceId = $null
  if (-not $CreateVoice -and (Test-Path -LiteralPath $voiceIdPath)) {
    $voiceId = (Get-Content -LiteralPath $voiceIdPath -Raw).Trim()
  }

  if ($serverAlreadyRunning -and $voiceId) {
    Write-Host "A voice is already configured, but JARVIS is still running on port $port." -ForegroundColor Yellow
    Write-Host 'Stop the current server with Ctrl+C, then run this setup command again to restart JARVIS with ElevenLabs.' -ForegroundColor Yellow
    return
  }

  if (-not $voiceId) {
    if (-not (Test-Path -LiteralPath $AudioPath)) {
      throw "Audio sample not found: $AudioPath"
    }

    Write-Host 'Uploading the selected sample to ElevenLabs to create your JARVIS voice...' -ForegroundColor Cyan
    Push-Location $projectRoot
    try {
      $resultLines = & python (Join-Path $projectRoot 'create_elevenlabs_voice.py') $AudioPath
      if ($LASTEXITCODE -ne 0) {
        throw 'Voice creation failed. See the ElevenLabs error above.'
      }
    } finally {
      Pop-Location
    }

    $result = ($resultLines -join "`n") | ConvertFrom-Json
    $voiceId = $result.voice_id
    if (-not $voiceId) {
      throw 'ElevenLabs did not return a voice ID.'
    }
    if ($result.requires_verification) {
      throw "ElevenLabs requires voice verification before use. Voice ID: $voiceId"
    }

    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $voiceIdPath) -Force
    Set-Content -LiteralPath $voiceIdPath -Value $voiceId -NoNewline
    Write-Host 'Voice clone created. Only the non-secret voice ID was saved locally.' -ForegroundColor Green
  } else {
    Write-Host 'Using the saved ElevenLabs voice ID. No audio sample will be uploaded.' -ForegroundColor Cyan
  }

  if ($serverAlreadyRunning) {
    Write-Host 'The current JARVIS server has not loaded the new voice yet.' -ForegroundColor Yellow
    Write-Host 'Stop it with Ctrl+C, then run this setup command again. It will reuse the saved voice ID and will not upload the sample again.' -ForegroundColor Yellow
    return
  }

  $env:ELEVENLABS_VOICE_ID = $voiceId
  if (-not $env:JARVIS_PROVIDER) {
    $env:JARVIS_PROVIDER = 'ollama'
  }
  if ($env:JARVIS_PROVIDER -eq 'ollama' -and -not $env:OLLAMA_MODEL) {
    $env:OLLAMA_MODEL = 'qwen2.5:7b'
  }

  Write-Host "Starting JARVIS at $BaseUrl. The ElevenLabs API key stays in this process and is not stored in the project." -ForegroundColor Green
  Push-Location $projectRoot
  try {
    & python (Join-Path $projectRoot 'assistant_app.py')
  } finally {
    Pop-Location
  }
} finally {
  if ($secureKey) {
    $secureKey.Dispose()
  }
  if ($null -eq $oldApiKey) {
    Remove-Item Env:ELEVENLABS_API_KEY -ErrorAction SilentlyContinue
  } else {
    $env:ELEVENLABS_API_KEY = $oldApiKey
  }
  if ($null -eq $oldVoiceId) {
    Remove-Item Env:ELEVENLABS_VOICE_ID -ErrorAction SilentlyContinue
  } else {
    $env:ELEVENLABS_VOICE_ID = $oldVoiceId
  }
}
