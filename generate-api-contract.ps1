param(
  [Parameter(Mandatory=$true)]
  [string]$ApiRoot,                 # e.g. src\app\api

  [string]$SrcRoot = "src",         # e.g. src
  [string]$OutFile = "API_CONTRACT.generated.md",
  [switch]$Diagnose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-OnePath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { throw "Resolve-OnePath: empty path" }
  $resolved = @(Resolve-Path -LiteralPath $p -ErrorAction Stop)
  if ($resolved.Count -lt 1) { throw "Path not found: $p" }
  if ($resolved.Count -gt 1) { throw "Path is ambiguous (multiple matches): $p" }
  return [string]$resolved[0].Path
}

function Safe-Join([string]$a, [string]$b) {
  if ($null -eq $a) { throw "Safe-Join: base is null" }
  if ($null -eq $b) { throw "Safe-Join: child is null" }
  return (Join-Path -Path $a -ChildPath $b)
}

function Get-RelativePath([string]$basePath, [string]$fullPath) {
  $base = (Resolve-OnePath $basePath).TrimEnd('\')
  $full = (Resolve-OnePath $fullPath)
  if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($base.Length).TrimStart('\')
  }
  return $full
}

function Extract-TopComment([string]$text) {
  # Собирает все стартовые комментарии файла, включая:
  # - одну/несколько строк // ...
  # - затем (или без) блок /* ... */
  # - пропуская пустые строки между ними
  # Останавливается на первой строке кода.

  $lines = $text -split "`r?`n"
  $i = 0

  $out = New-Object System.Collections.Generic.List[string]

  function Add-Line([string]$s) {
    $t = $s.TrimEnd()
    if ($t -ne "") { [void]$out.Add($t) }
  }

  # skip leading empty lines
  while ($i -lt $lines.Count -and $lines[$i].Trim() -eq "") { $i++ }
  if ($i -ge $lines.Count) { return @() }

  $progress = $true
  while ($progress -and $i -lt $lines.Count) {
    $progress = $false

    # skip empty lines between comment blocks
    while ($i -lt $lines.Count -and $lines[$i].Trim() -eq "") {
      $i++
      $progress = $true
    }
    if ($i -ge $lines.Count) { break }

    $t = $lines[$i].TrimStart()

    # 1) line comments //
    if ($t.StartsWith("//")) {
      while ($i -lt $lines.Count) {
        $t2 = $lines[$i].TrimStart()
        if (-not $t2.StartsWith("//")) { break }
        Add-Line (($t2 -replace "^//\s?", "").TrimEnd())
        $i++
      }
      $progress = $true
      continue
    }

    # 2) block comment /* ... */
    if ($t.StartsWith("/*")) {
      $inBlock = $true
      while ($i -lt $lines.Count -and $inBlock) {
        $line = $lines[$i]
        $trim = $line.Trim()

        # чистим начало/звёздочки/конец
        $clean = $line
        $clean = $clean -replace "^\s*/\*\s?", ""
        $clean = $clean -replace "\s*\*/\s*$", ""
        $clean = $clean -replace "^\s*\*\s?", ""
        $clean = $clean.TrimEnd()

        if ($clean.Trim() -ne "") { Add-Line ($clean.Trim()) }

        if ($trim.Contains("*/")) { $inBlock = $false }
        $i++
      }
      $progress = $true
      continue
    }

    # 3) not a comment => code starts
    break
  }

  return @($out)
}

function Extract-Methods([string]$text) {
  $methods = @{}
  foreach ($m in @("GET","POST")) {
    $rx = [regex]::new("export\s+(async\s+)?function\s+$m\s*\(([^)]*)\)", "IgnoreCase")
    $match = $rx.Match($text)
    if ($match.Success) {
      $methods[$m] = @{
        Signature = $match.Value
        ParamsRaw = $match.Groups[2].Value.Trim()
      }
    }
  }
  return $methods
}

function Extract-QueryParams([string]$text) {
  $names = New-Object System.Collections.Generic.HashSet[string]
  $rx = [regex]::new("searchParams\.(get|getAll|has)\(\s*['""]([^'""]+)['""]\s*\)", "IgnoreCase")
  foreach ($m in $rx.Matches($text)) { [void]$names.Add($m.Groups[2].Value) }
  return @(@($names) | Sort-Object)
}

function Extract-BodyFields([string]$text) {
  $names = New-Object System.Collections.Generic.HashSet[string]

  $rx1 = [regex]::new("const\s*\{\s*([^}]+)\s*\}\s*=\s*await\s+\w+\.json\(\s*\)", "IgnoreCase")
  foreach ($m in $rx1.Matches($text)) {
    $raw = $m.Groups[1].Value
    foreach ($p in ($raw -split ",")) {
      $t = $p.Trim()
      if ($t -eq "") { continue }
      $t = ($t -split ":")[0].Trim()
      $t = ($t -split "=")[0].Trim()
      if ($t -ne "") { [void]$names.Add($t) }
    }
  }

  $rxBodyVar = [regex]::new("const\s+(\w+)\s*=\s*await\s+\w+\.json\(\s*\)", "IgnoreCase")
  $bodyVars = @()
  foreach ($m in $rxBodyVar.Matches($text)) { $bodyVars += $m.Groups[1].Value }

  foreach ($bv in ($bodyVars | Select-Object -Unique)) {
    $rx2 = [regex]::new("const\s*\{\s*([^}]+)\s*\}\s*=\s*$bv\b", "IgnoreCase")
    foreach ($m2 in $rx2.Matches($text)) {
      $raw = $m2.Groups[1].Value
      foreach ($p in ($raw -split ",")) {
        $t = $p.Trim()
        if ($t -eq "") { continue }
        $t = ($t -split ":")[0].Trim()
        $t = ($t -split "=")[0].Trim()
        if ($t -ne "") { [void]$names.Add($t) }
      }
    }
  }

  return @(@($names) | Sort-Object)
}

function Extract-ResponseKeysOrSnippet([string]$text) {
  $idx = $text.IndexOf("NextResponse.json", [System.StringComparison]::Ordinal)
  if ($idx -lt 0) { return @{ Keys=@(); Snippet="" } }

  $paren = $text.IndexOf("(", $idx)
  if ($paren -lt 0) {
    $snip = $text.Substring([Math]::Max(0,$idx), [Math]::Min(400, $text.Length-$idx))
    return @{ Keys=@(); Snippet=$snip }
  }

  $tailLen = [Math]::Min(2000, $text.Length - $paren)
  $tail = $text.Substring($paren, $tailLen)

  $brace = $tail.IndexOf("{")
  if ($brace -lt 0) {
    $snip = $text.Substring([Math]::Max(0,$idx), [Math]::Min(500, $text.Length-$idx))
    return @{ Keys=@(); Snippet=$snip }
  }

  $depth = 0
  $end = -1
  for ($i=0; $i -lt $tail.Length; $i++) {
    $ch = $tail[$i]
    if ($ch -eq "{") { $depth++ }
    elseif ($ch -eq "}") { $depth--; if ($depth -eq 0) { $end = $i; break } }
  }

  if ($end -lt 0) {
    $snip = $text.Substring([Math]::Max(0,$idx), [Math]::Min(500, $text.Length-$idx))
    return @{ Keys=@(); Snippet=$snip }
  }

  $obj = $tail.Substring($brace, $end - $brace + 1)

  $keySet = New-Object System.Collections.Generic.HashSet[string]
  $rxKey = [regex]::new('(?m)^\s*(?:"([^"]+)"|''([^'']+)''|([A-Za-z_$][\w$]*))\s*:', "IgnoreCase")
  foreach ($m in $rxKey.Matches($obj)) {
    $k = $m.Groups[1].Value
    if ($k -eq "") { $k = $m.Groups[2].Value }
    if ($k -eq "") { $k = $m.Groups[3].Value }
    if ($k -ne "") { [void]$keySet.Add($k) }
  }

  if ($keySet.Count -gt 0) {
    return @{ Keys=@(@($keySet) | Sort-Object); Snippet="" }
  }

  return @{ Keys=@(); Snippet=$obj }
}

# -------------------- main --------------------

$cwd = (Get-Location).Path
$apiRootPath = Resolve-OnePath (Safe-Join $cwd $ApiRoot)
$srcRootPath = Resolve-OnePath (Safe-Join $cwd $SrcRoot)

$routeFiles = @(Get-ChildItem -Path $apiRootPath -Recurse -File -Filter "route.ts" | Sort-Object FullName)

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# API Contract (generated)')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
[void]$sb.AppendLine('')

foreach ($f in $routeFiles) {
  $full = [string]$f.FullName
  if ($Diagnose) { Write-Host ('Reading: ' + $full) }

  $text = Get-Content -LiteralPath $full -Raw
  $relFromSrc = Get-RelativePath -basePath $srcRootPath -fullPath $full

  $urlPath = ''
  $norm = $relFromSrc -replace "\\","/"
  if ($norm -match '^app/api/(.+)/route\.ts$') { $urlPath = '/api/' + $Matches[1] }
  elseif ($norm -match '^app/api/route\.ts$') { $urlPath = '/api' }

  $topComment = @(Extract-TopComment $text)
  $methods = Extract-Methods $text

  [void]$sb.AppendLine('---')
  [void]$sb.AppendLine('')

  $title = '(route)'
  if ($urlPath -ne '') { $title = $urlPath }
  [void]$sb.AppendLine('## ' + $title)
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('- **File (from src):** ' + $relFromSrc)
  if ($urlPath -ne '') { [void]$sb.AppendLine('- **Route:** ' + $urlPath) }
  [void]$sb.AppendLine('')

  [void]$sb.AppendLine('### Description')
  [void]$sb.AppendLine('')
  if ((@($topComment)).Count -gt 0) {
    foreach ($line in $topComment) { [void]$sb.AppendLine($line) }
  } else {
    [void]$sb.AppendLine('_No top-of-file comment block found._')
  }
  [void]$sb.AppendLine('')

  [void]$sb.AppendLine('### Methods')
  [void]$sb.AppendLine('')
  if ((@($methods.Keys)).Count -eq 0) {
    [void]$sb.AppendLine('_No exported GET/POST handlers found._')
    [void]$sb.AppendLine('')
    continue
  }

  foreach ($m in @('GET','POST')) {
    if (-not $methods.ContainsKey($m)) { continue }

    $q = @(Extract-QueryParams $text)
    $b = @(Extract-BodyFields $text)
    $resp = Extract-ResponseKeysOrSnippet $text
    $respKeys = @($resp.Keys)

    [void]$sb.AppendLine('#### ' + $m)
    [void]$sb.AppendLine('')

    $sig = (($methods[$m].Signature -replace "\s+"," ").Trim())
    [void]$sb.AppendLine('- **Handler signature:** ' + $sig)

    if ((@($q)).Count -gt 0) { [void]$sb.AppendLine('- **Query params:** ' + ($q -join ', ')) }
    else { [void]$sb.AppendLine('- **Query params:** _not detected_') }

    if ($m -eq 'POST') {
      if ((@($b)).Count -gt 0) { [void]$sb.AppendLine('- **Body fields:** ' + ($b -join ', ')) }
      else { [void]$sb.AppendLine('- **Body fields:** _not detected_') }
    }

    if ((@($respKeys)).Count -gt 0) {
      [void]$sb.AppendLine('- **Response JSON keys (heuristic):** ' + ($respKeys -join ', '))
    } elseif ($resp.Snippet -ne '') {
      [void]$sb.AppendLine('- **Response (snippet):**')
      [void]$sb.AppendLine('')
      [void]$sb.AppendLine('```ts')
      [void]$sb.AppendLine($resp.Snippet.Trim())
      [void]$sb.AppendLine('```')
    } else {
      [void]$sb.AppendLine('- **Response:** _not detected_')
    }

    [void]$sb.AppendLine('')
  }
}

$sb.ToString() | Out-File -LiteralPath (Safe-Join $cwd $OutFile) -Encoding UTF8
Write-Host ('Done. Generated: ' + (Safe-Join $cwd $OutFile))