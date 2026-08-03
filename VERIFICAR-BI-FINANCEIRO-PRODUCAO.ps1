#requires -Version 5.1

param(
    [string]$ApiUrl = "https://stockflow-backend-6gxl.onrender.com/api"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function ConvertTo-PlainText {
    param([Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host "VERIFICAÇÃO SOMENTE LEITURA DO BI FINANCEIRO" -ForegroundColor Cyan
Write-Host "Nenhum saldo, OS ou registro será alterado." -ForegroundColor DarkGray
Write-Host ""

$login = Read-Host "Usuário ou e-mail"
$securePassword = Read-Host "Senha" -AsSecureString
$password = ConvertTo-PlainText $securePassword

$loginResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiUrl/auth/login" `
    -ContentType "application/json; charset=utf-8" `
    -Body (@{
        email = $login
        password = $password
    } | ConvertTo-Json)

$token = $loginResponse.data.token

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "O login não retornou token."
}

$headers = @{
    Authorization = "Bearer $token"
}

$response = Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiUrl/bi/financial?periodPreset=90d" `
    -Headers $headers

$cards = $response.data.cards

if ($null -eq $cards) {
    throw "A API não retornou os cards do BI Financeiro."
}

$expectedTotal = [math]::Round(
    [decimal]$cards.serializedConsumedValue +
    [decimal]$cards.consumablesAppliedValue,
    2
)

$actualTotal = [math]::Round([decimal]$cards.totalConsumed, 2)
$equationOk = $expectedTotal -eq $actualTotal

Write-Host ""
Write-Host "RESULTADO" -ForegroundColor Green
Write-Host "Baixado em OS concluídas:     R$ $actualTotal"
Write-Host "Equipamentos baixados em OS:  R$ $([math]::Round([decimal]$cards.serializedConsumedValue, 2))"
Write-Host "Consumíveis aplicados:        R$ $([math]::Round([decimal]$cards.consumablesAppliedValue, 2))"
Write-Host "Equipamentos instalados hoje: R$ $([math]::Round([decimal]$cards.installedCustomerValue, 2))"
Write-Host ""

if ($equationOk) {
    Write-Host "Conferência do consumo: OK" -ForegroundColor Green
}
else {
    Write-Host "Conferência do consumo: DIVERGENTE" -ForegroundColor Red
}

if ($cards.financialCoverageAvailable) {
    Write-Host "Cobertura documentada:        $($cards.financialCoverage)%"
    Write-Host "Diferença a conciliar:        R$ $([math]::Abs([decimal]$cards.coverageDifferenceValue))"
}
else {
    Write-Host "Cobertura documentada: indisponível"
    Write-Host "Motivo: $($cards.financialCoverageReason)"
}

Write-Host ""
Write-Host "Verificação concluída sem alterações no banco." -ForegroundColor Green
