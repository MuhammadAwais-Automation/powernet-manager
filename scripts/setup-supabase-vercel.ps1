# PowerNet Manager — Supabase + Vercel CLI OAuth setup and migration push
# Run in a normal PowerShell / Terminal window (interactive TTY required for OAuth)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ProjectRef = "jzhxckqomhjgokkyxkmk"

Set-Location $ProjectRoot

Write-Host ""
Write-Host "=== PowerNet CLI Setup ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRef"
Write-Host ""

# 1. Supabase OAuth
Write-Host "[1/4] Supabase login (browser OAuth)..." -ForegroundColor Yellow
supabase login
if ($LASTEXITCODE -ne 0) { throw "Supabase login failed" }

# 2. Link remote project
Write-Host "[2/4] Linking Supabase project..." -ForegroundColor Yellow
supabase link --project-ref $ProjectRef --yes
if ($LASTEXITCODE -ne 0) { throw "Supabase link failed" }

# 3. Push migrations (includes promised_date)
Write-Host "[3/4] Pushing database migrations..." -ForegroundColor Yellow
supabase db push --yes
if ($LASTEXITCODE -ne 0) { throw "Supabase db push failed" }

# 4. Vercel OAuth
Write-Host "[4/4] Vercel login (browser OAuth)..." -ForegroundColor Yellow
vercel login
if ($LASTEXITCODE -ne 0) { throw "Vercel login failed" }

Write-Host ""
Write-Host "Done. Supabase linked + migrations pushed. Vercel authenticated." -ForegroundColor Green
Write-Host "Next: run 'vercel link' in this folder if you want to attach the dashboard deployment."
Write-Host ""