#requires -Version 5.1

param(
    [string]$ApiUrl = 'https://stockflow-backend-6gxl.onrender.com/api'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiUrl = $ApiUrl.TrimEnd('/')
$login = Read-Host 'Usuário administrador'
$password = Read-Host 'Senha' -AsSecureString
$passwordText = [System.Net.NetworkCredential]::new('', $password).Password

Write-Host 'Autenticando...' -ForegroundColor Cyan

$loginResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiUrl/auth/login" `
    -ContentType 'application/json; charset=utf-8' `
    -Body (@{
        login = $login
        password = $passwordText
    } | ConvertTo-Json -Compress)

$token = if ($loginResponse.data.token) {
    $loginResponse.data.token
}
else {
    $loginResponse.token
}

if (!$token) {
    throw 'A API não retornou token de autenticação.'
}

$headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/json'
}

Write-Host 'Consultando o conector verde...' -ForegroundColor Cyan

$response = Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiUrl/materials?search=ATFX200571" `
    -Headers $headers

$rows = if ($null -ne $response.data) {
    @($response.data)
}
else {
    @($response)
}

$material = $rows | Where-Object {
    ([string]$_.sku).Trim().ToUpperInvariant() -eq 'ATFX200571'
} | Select-Object -First 1

if (!$material) {
    throw 'O material ATFX200571 não foi encontrado pela API.'
}

$limit = [decimal]$material.maxQuantityPerServiceOrder

Write-Host ''
Write-Host '==========================================================' -ForegroundColor Green
Write-Host ' VERIFICAÇÃO DO LIMITE POR OS' -ForegroundColor Green
Write-Host '==========================================================' -ForegroundColor Green
Write-Host ''
Write-Host "SKU:       $($material.sku)"
Write-Host "Material:  $($material.name)"
Write-Host "Serial:    $($material.requiresSerial)"
Write-Host "Limite OS: $limit"
Write-Host ''

if ($limit -ne 2) {
    throw "O limite retornado foi $limit, mas deveria ser 2. Não faça o redeploy da Vercel antes de corrigir."
}

Write-Host 'Backend confirmado: limite de 2 unidades por OS está ativo.' -ForegroundColor Green
Write-Host 'Agora o frontend pode ser redeployado na Vercel.' -ForegroundColor Green
