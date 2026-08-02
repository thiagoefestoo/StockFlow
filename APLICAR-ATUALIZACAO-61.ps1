#requires -Version 5.1

param(
    [string]$Repo = "C:\Users\TH\Documents\GitHub\estoque-superinfra",
    [string]$Zip = "$HOME\Downloads\atualizacao-61-ordenacao-listas-recentes.zip"
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
    throw "A pasta informada não parece ser o repositório Git do sistema: $Repo"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$temp = Join-Path $env:TEMP "estoque-superinfra-atualizacao-61-$stamp"
$backup = Join-Path $HOME "Documents\backup-estoque-superinfra-atualizacao-61-$stamp"
$backupBuild = Join-Path $backup 'frontend\build'
$newFilesManifest = Join-Path $backup 'arquivos-novos.txt'

New-Item -ItemType Directory -Path $temp -Force | Out-Null
New-Item -ItemType Directory -Path $backup -Force | Out-Null

try {
    Write-Host "Extraindo atualização..." -ForegroundColor Cyan
    Expand-Archive -LiteralPath $Zip -DestinationPath $temp -Force

    $source = Join-Path $temp 'estoque-superinfra'

    if (!(Test-Path -LiteralPath $source -PathType Container)) {
        throw "Estrutura inválida: a pasta estoque-superinfra não existe dentro do ZIP."
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

    Write-Host "Criando backup dos arquivos que serão substituídos..." -ForegroundColor Cyan

    if (Test-Path -LiteralPath (Join-Path $Repo 'frontend\build')) {
        New-Item -ItemType Directory -Path (Split-Path $backupBuild) -Force | Out-Null
        Copy-Item `
            -LiteralPath (Join-Path $Repo 'frontend\build') `
            -Destination $backupBuild `
            -Recurse `
            -Force
    }

    $newFiles = @()
    $patchFiles = @(
        Get-ChildItem -LiteralPath $source -File -Recurse
    )

    foreach ($file in $patchFiles) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\', '/')
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

    Write-Host "Aplicando os arquivos da atualização..." -ForegroundColor Cyan

    foreach ($file in $patchFiles) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\', '/')
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

    if (!(Test-Path -LiteralPath (Join-Path $Repo 'backend\node_modules'))) {
        Invoke-NativeChecked `
            -Command 'npm' `
            -Arguments @('install', '--prefix', 'backend') `
            -Description 'Instalação do backend'
    }

    if (!(Test-Path -LiteralPath (Join-Path $Repo 'frontend\node_modules'))) {
        Invoke-NativeChecked `
            -Command 'npm' `
            -Arguments @('install', '--prefix', 'frontend') `
            -Description 'Instalação do frontend'
    }

    Write-Host "Validando backend..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command 'npm' `
        -Arguments @('run', 'check', '--prefix', 'backend') `
        -Description 'Validação do backend'

    Write-Host "Compilando frontend..." -ForegroundColor Cyan

    Invoke-NativeChecked `
        -Command 'npm' `
        -Arguments @('run', 'build', '--prefix', 'frontend') `
        -Description 'Build do frontend'

    Write-Host "Validando as diferenças do Git..." -ForegroundColor Cyan

    $gitCheckPaths = @(
        $patchFiles |
            ForEach-Object {
                $_.FullName.Substring($source.Length).TrimStart('\', '/')
            }
    )

    Invoke-NativeChecked `
        -Command 'git' `
        -Arguments (@('diff', '--check', '--') + $gitCheckPaths) `
        -Description 'git diff --check da atualização'

    Write-Host ''
    Write-Host 'Atualização 61 aplicada e validada com sucesso.' -ForegroundColor Green
    Write-Host "Backup: $backup" -ForegroundColor Green
    Write-Host ''
    git status --short
}
catch {
    Write-Host ''
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
        $relative = $file.FullName.Substring($backup.Length).TrimStart('\', '/')
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
            -LiteralPath (Join-Path $Repo 'frontend\build') `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue

        New-Item `
            -ItemType Directory `
            -Path (Join-Path $Repo 'frontend') `
            -Force | Out-Null

        Copy-Item `
            -LiteralPath $backupBuild `
            -Destination (Join-Path $Repo 'frontend\build') `
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
