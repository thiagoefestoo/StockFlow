#requires -Version 5.1

param(
    [string]$Repo = "C:\Users\TH\Documents\GitHub\estoque-superinfra",
    [string]$Zip = "$HOME\Downloads\atualizacao-75-alarmes-por-cidade-dicas-inventario.zip"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [string]$Description = $Command
    )

    & $Command @Arguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "$Description falhou com código $exitCode."
    }
}

if (!(Test-Path -LiteralPath $Repo -PathType Container)) {
    throw "Projeto não encontrado em: $Repo"
}

if (!(Test-Path -LiteralPath $Zip -PathType Leaf)) {
    throw "Pacote não encontrado em: $Zip"
}

if (!(Test-Path -LiteralPath (Join-Path $Repo '.git') -PathType Container)) {
    throw "A pasta informada não é o repositório Git do sistema: $Repo"
}

$targets = @(
    "backend/app/controllers/notificationController.js",
    "backend/app/controllers/operationsController.js",
    "backend/app/services/intelligenceService.js",
    "backend/app/services/operationalScopeService.js",
    "backend/app/services/notificationScopeMatcher.js",
    "backend/app/services/notificationScopeService.js",
    "backend/scripts/test-alert-city-scope-and-inventory-tips.js",
    "frontend/src/components/LivePulse.jsx",
    "frontend/src/components/NotificationBell.jsx"
)

Set-Location $Repo

$existingChanges = @(
    git status --porcelain -- $targets
)

if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível verificar o estado atual do repositório."
}

if ($existingChanges.Count -gt 0) {
    Write-Host "Existem alterações locais nos arquivos usados pela atualização 75:" -ForegroundColor Yellow
    $existingChanges | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    throw "Faça commit ou backup dessas alterações antes de aplicar a atualização."
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$temp = Join-Path $env:TEMP "estoque-superinfra-atualizacao-75-$stamp"
$backup = Join-Path $HOME "Documents\backup-estoque-superinfra-atualizacao-75-$stamp"
$backupBuild = Join-Path $backup "frontend\build"
$newFilesManifest = Join-Path $backup "arquivos-novos.txt"

New-Item -ItemType Directory -Path $temp -Force | Out-Null
New-Item -ItemType Directory -Path $backup -Force | Out-Null

try {
    Write-Host "Extraindo atualização 75..." -ForegroundColor Cyan
    Expand-Archive -LiteralPath $Zip -DestinationPath $temp -Force

    $source = Join-Path $temp "estoque-superinfra"

    if (!(Test-Path -LiteralPath $source -PathType Container)) {
        throw "Estrutura inválida dentro do ZIP."
    }

    $forbidden = Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object {
        $_.Name -eq '.env' -or
        $_.Name -like '.env.*' -or
        $_.Name -eq '.git' -or
        $_.Name -eq 'node_modules'
    }

    if ($forbidden) {
        throw "O pacote contém arquivos protegidos e não será aplicado."
    }

    $patchFiles = @(
        Get-ChildItem -LiteralPath $source -File -Recurse
    )

    if ($patchFiles.Count -eq 0) {
        throw "Nenhum arquivo foi encontrado dentro do pacote."
    }

    Write-Host "Criando backup dos arquivos atuais..." -ForegroundColor Cyan

    if (Test-Path -LiteralPath (Join-Path $Repo "frontend\build")) {
        New-Item -ItemType Directory -Path (Split-Path $backupBuild) -Force | Out-Null

        Copy-Item `
            -LiteralPath (Join-Path $Repo "frontend\build") `
            -Destination $backupBuild `
            -Recurse `
            -Force
    }

    $newFiles = @()

    foreach ($file in $patchFiles) {
        $relative = $file.FullName.Substring($source.Length).TrimStart([char[]]"\/")
        $target = Join-Path $Repo $relative
        $backupTarget = Join-Path $backup $relative

        if (Test-Path -LiteralPath $target -PathType Leaf) {
            New-Item `
                -ItemType Directory `
                -Path (Split-Path $backupTarget) `
                -Force | Out-Null

            Copy-Item `
                -LiteralPath $target `
                -Destination $backupTarget `
                -Force
        }
        else {
            $newFiles += $relative
        }
    }

    $newFiles |
        Set-Content `
            -LiteralPath $newFilesManifest `
            -Encoding UTF8

    Write-Host "Aplicando os arquivos..." -ForegroundColor Cyan

    foreach ($file in $patchFiles) {
        $relative = $file.FullName.Substring($source.Length).TrimStart([char[]]"\/")
        $target = Join-Path $Repo $relative

        New-Item `
            -ItemType Directory `
            -Path (Split-Path $target) `
            -Force | Out-Null

        Copy-Item `
            -LiteralPath $file.FullName `
            -Destination $target `
            -Force
    }

    Set-Location $Repo

    Write-Host "Validando backend..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command "npm" `
        -Arguments @("run", "check", "--prefix", "backend") `
        -Description "Validação do backend"

    Write-Host "Testando segregação dos alarmes..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command "node" `
        -Arguments @("backend/scripts/test-alert-city-scope-and-inventory-tips.js") `
        -Description "Teste dos alarmes e dicas"

    if (!(Test-Path -LiteralPath (Join-Path $Repo "frontend\node_modules"))) {
        Write-Host "Instalando dependências do frontend para validação..." -ForegroundColor Cyan

        Invoke-NativeChecked `
            -Command "npm" `
            -Arguments @("install", "--prefix", "frontend") `
            -Description "Instalação do frontend"
    }

    Write-Host "Compilando frontend..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command "npm" `
        -Arguments @("run", "build", "--prefix", "frontend") `
        -Description "Build do frontend"

    $gitCheckPaths = @(
        $patchFiles | ForEach-Object {
            $_.FullName.Substring($source.Length).TrimStart([char[]]"\/")
        }
    )

    Write-Host "Validando diferenças do Git..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command "git" `
        -Arguments (@("diff", "--check", "--") + $gitCheckPaths) `
        -Description "git diff --check"

    Write-Host ""
    Write-Host "Atualização 75 aplicada e validada com sucesso." -ForegroundColor Green
    Write-Host "Backup local: $backup" -ForegroundColor Green
    Write-Host "Nenhuma migration e nenhum saldo foram alterados." -ForegroundColor Green
    Write-Host ""
    git status --short
}
catch {
    Write-Host ""
    Write-Host "Falha: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Restaurando os arquivos anteriores..." -ForegroundColor Yellow

    if (Test-Path -LiteralPath $newFilesManifest) {
        Get-Content -LiteralPath $newFilesManifest | ForEach-Object {
            $relative = ([string]$_).Trim()

            if ($relative) {
                Remove-Item `
                    -LiteralPath (Join-Path $Repo $relative) `
                    -Force `
                    -ErrorAction SilentlyContinue
            }
        }
    }

    $backupFiles = @(
        Get-ChildItem -LiteralPath $backup -File -Recurse |
            Where-Object {
                $_.FullName -ne $newFilesManifest -and
                $_.FullName -notlike "$backupBuild*"
            }
    )

    foreach ($file in $backupFiles) {
        $relative = $file.FullName.Substring($backup.Length).TrimStart([char[]]"\/")
        $target = Join-Path $Repo $relative

        New-Item `
            -ItemType Directory `
            -Path (Split-Path $target) `
            -Force | Out-Null

        Copy-Item `
            -LiteralPath $file.FullName `
            -Destination $target `
            -Force
    }

    if (Test-Path -LiteralPath $backupBuild) {
        Remove-Item `
            -LiteralPath (Join-Path $Repo "frontend\build") `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue

        New-Item `
            -ItemType Directory `
            -Path (Join-Path $Repo "frontend") `
            -Force | Out-Null

        Copy-Item `
            -LiteralPath $backupBuild `
            -Destination (Join-Path $Repo "frontend\build") `
            -Recurse `
            -Force
    }

    throw "A atualização não foi mantida. Os arquivos anteriores foram restaurados. Backup: $backup"
}
finally {
    Remove-Item `
        -LiteralPath $temp `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue
}
