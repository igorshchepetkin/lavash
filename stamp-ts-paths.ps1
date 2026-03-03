param(
  [Parameter(Mandatory=$true)]
  [string]$SrcRoot,                 # например: C:\proj\myapp\src

  [switch]$DryRun                   # если указать -DryRun, то ничего не пишет, только показывает что бы сделал
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Path([string]$p) {
  return (Resolve-Path $p).Path.TrimEnd('\')
}

function Get-RelativePath([string]$basePath, [string]$fullPath) {
  $base = $basePath.TrimEnd('\')
  $full = $fullPath
  if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($base.Length).TrimStart('\')
  }
  return $full
}

$src = Normalize-Path $SrcRoot
if (-not (Test-Path $src)) { throw "SrcRoot не найден: $src" }

# Ищем api-папку автоматически
$apiDir = Join-Path $src "app\api"
if (-not (Test-Path $apiDir)) {
  throw "Не нашёл папку app\api внутри src. Ожидал: $apiDir"
}

$tsFiles = Get-ChildItem -Path $apiDir -Recurse -File -Filter "*.ts" | Sort-Object FullName

# Комментарий, который мы ставим: // src/<relative>
$stampRx = [regex]::new('^\s*//\s*src[\\/].+$', 'IgnoreCase')

$changed = 0
$skipped = 0

foreach ($f in $tsFiles) {
  $full = $f.FullName
  $rel = Get-RelativePath -basePath $src -fullPath $full
  $relNorm = ($rel -replace '\\','/')

  $stampLine = "// src/$relNorm"

  # Читаем как строки, чтобы аккуратно вставлять/обновлять первую строку
  $lines = Get-Content -LiteralPath $full

  if ($lines.Count -eq 0) {
    # пустой файл: просто добавляем строку
    $newLines = @($stampLine)
  } else {
    $first = $lines[0]

    if ($stampRx.IsMatch($first)) {
      # Уже есть штамп — обновим (на случай перемещения файла)
      if ($first.Trim() -eq $stampLine) {
        $skipped++
        continue
      }
      $lines[0] = $stampLine
      $newLines = $lines
    } else {
      # Нет штампа — вставим на первую строку
      $newLines = @($stampLine) + $lines
    }
  }

  if ($DryRun) {
    Write-Host "[DRY] $relNorm"
    $changed++
    continue
  }

  # Важно: пишем UTF-8 (без BOM) — так обычно комфортнее для TS/Next проектов.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($full, $newLines, $utf8NoBom)

  $changed++
}

Write-Host "Done."
Write-Host "Changed: $changed"
Write-Host "Unchanged (already correct): $skipped"
Write-Host "Root: $src"
Write-Host "API dir: $apiDir"