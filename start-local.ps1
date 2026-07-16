Write-Host "=== StockFlow Local ===" -ForegroundColor Cyan
Write-Host "Este script abre backend e frontend em janelas separadas do PowerShell." -ForegroundColor Gray

if (!(Test-Path "backend\.env")) {
  if (Test-Path "backend\.env.local.example") {
    Copy-Item "backend\.env.local.example" "backend\.env"
    Write-Host "Criado backend\.env a partir de backend\.env.local.example" -ForegroundColor Green
  }
}

if (!(Test-Path "frontend\.env")) {
  if (Test-Path "frontend\.env.local.example") {
    Copy-Item "frontend\.env.local.example" "frontend\.env"
    Write-Host "Criado frontend\.env a partir de frontend\.env.local.example" -ForegroundColor Green
  }
}

Write-Host "Instalando dependencias do backend..." -ForegroundColor Yellow
Push-Location backend
npm install
Pop-Location

Write-Host "Instalando dependencias do frontend..." -ForegroundColor Yellow
Push-Location frontend
npm install
Pop-Location

Write-Host "Abrindo backend em http://localhost:3000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm start"

Write-Host "Abrindo frontend em http://localhost:5173" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm start"

Write-Host "Pronto. Aguarde alguns segundos e abra http://localhost:5173" -ForegroundColor Green
