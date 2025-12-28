param(
  [string]$OutDir = "deploy_out/backend",
  [switch]$GenerateLock
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
  $invocationPath = $MyInvocation.MyCommand.Path
  if ($invocationPath) { $scriptDir = Split-Path -Parent $invocationPath }
}
if (-not $scriptDir) {
  $scriptDir = (Get-Location).Path
}

$root = (Resolve-Path (Join-Path $scriptDir "..")).Path
$out = (Resolve-Path (Join-Path $root $OutDir) -ErrorAction SilentlyContinue)
if (-not $out) {
  Ensure-Dir (Join-Path $root $OutDir)
  $out = (Resolve-Path (Join-Path $root $OutDir)).Path
} else {
  $out = $out.Path
}

Ensure-Dir $out
Ensure-Dir (Join-Path $out "server")
Ensure-Dir (Join-Path $out "src/data")

Copy-Item -Force (Join-Path $root "server/lke-token-server.mjs") (Join-Path $out "server/lke-token-server.mjs")
Copy-Item -Force (Join-Path $root "server/logistics-server.mjs") (Join-Path $out "server/logistics-server.mjs")

if (Test-Path (Join-Path $root "src/data/logistics.json")) {
  Copy-Item -Force (Join-Path $root "src/data/logistics.json") (Join-Path $out "src/data/logistics.json")
}

$packageJson = @'
{
  "name": "recommend-module-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/lke-token-server.mjs"
  },
  "dependencies": {
    "dotenv": "16.4.5"
  }
}
'@
Set-Content -Encoding UTF8 -Path (Join-Path $out "package.json") -Value $packageJson

$envExample = @'
# Node backend env (copy to .env.local and fill real values)
SERVER_PORT=3000
SERVER_HOST=127.0.0.1

# DeepSeek (required if using AI chat)
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Optional: enable debug routes
LKE_DEBUG=false

# Optional: Tencent LKE token relay (do NOT put these into VITE_* variables)
SECRET_ID=
SECRET_KEY=
LKE_REGION=ap-guangzhou
'@
Set-Content -Encoding UTF8 -Path (Join-Path $out ".env.example") -Value $envExample

$readme = @'
# Backend deploy (Nginx + Node)

## 1) Install & run

```powershell
cd .
copy .env.example .env.local
# edit .env.local, at least set DEEPSEEK_API_KEY
npm install --omit=dev
node server/lke-token-server.mjs
```

Health check: http://127.0.0.1:3000/health

## 2) Nginx proxy (example)

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_buffering off;
  proxy_read_timeout 600s;
}
location /getDemoToken {
  proxy_pass http://127.0.0.1:3000/getDemoToken;
}
```
'@
Set-Content -Encoding UTF8 -Path (Join-Path $out "README.md") -Value $readme

if ($GenerateLock) {
  Push-Location $out
  try {
    npm install --package-lock-only --ignore-scripts | Out-Host
  } finally {
    Pop-Location
  }
}

Write-Host "[make-backend-deploy] Done -> $out"
