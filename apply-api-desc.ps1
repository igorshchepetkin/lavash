param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$DescFile = "api_desc.txt",
  [switch]$DryRun,
  [switch]$Strict,
  [switch]$Diagnose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-AllTextUtf8([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-AllTextUtf8NoBom([string]$path, [string]$text) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
}

function Normalize-Newlines([string]$s) {
  return ($s -replace "`r`n", "`n" -replace "`r", "`n")
}

function Strip-WeirdUnicode([string]$s) {
  if ($null -eq $s) { return "" }

  $t = $s

  # 1) remove Unicode "format" chars (Cf): ZWSP/ZWJ/ZWNJ/FEFF/etc.
  $t = [regex]::Replace($t, '\p{Cf}', '')

  # 2) normalize NBSP to space
  $t = $t -replace [char]0x00A0, ' '

  # 3) remove remaining control chars except tab/space (for our compare)
  #    (we don't need CR in lines; newline is handled by split)
  $t = [regex]::Replace($t, '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', '')

  return $t
}

function Normalize-ForCompare([string]$s) {
  $t = Strip-WeirdUnicode $s
  $t = $t.Trim()
  $t = $t -replace '\\','/'
  # collapse whitespace (tabs/spaces) into a single space
  $t = [regex]::Replace($t, '\s+', ' ')
  return $t.ToLowerInvariant()
}

function To-Codepoints([string]$s) {
  if ($null -eq $s) { return "" }
  $chars = $s.ToCharArray()
  return ($chars | ForEach-Object { "U+{0:X4}" -f ([int][char]$_) }) -join " "
}

function Clean-PathFromDesc([string]$s) {
  $t = Strip-WeirdUnicode $s
  $t = $t.Trim()
  $t = $t -replace '\\','/'
  # also strip accidental trailing spaces
  return $t
}

function Make-Candidates([string]$root, [string]$relPathFromDesc) {
  $p = Clean-PathFromDesc $relPathFromDesc

  $pNoSrc = $p
  if ($pNoSrc.ToLowerInvariant().StartsWith("src/")) { $pNoSrc = $pNoSrc.Substring(4) }

  @(
    (Join-Path $root ($p -replace '/', '\')),                          # root + src/...
    (Join-Path $root ($pNoSrc -replace '/', '\')),                     # root + app/api/...
    (Join-Path (Join-Path $root "src") ($pNoSrc -replace '/', '\')),   # root/src + app/api/...
    (Join-Path (Join-Path $root "src") ($p -replace '/', '\'))         # root/src + src/app/api/...
  )
}

function Resolve-ApiFilePath([string]$root, [string]$relPathFromDesc, [ref]$debugOut) {
  $cands = Make-Candidates $root $relPathFromDesc
  $hits = @()
  foreach ($c in $cands) {
    $ok = Test-Path -LiteralPath $c
    $hits += [pscustomobject]@{ candidate = $c; exists = $ok }
    if ($ok) {
      $debugOut.Value = $hits
      return (Resolve-Path -LiteralPath $c).Path
    }
  }
  $debugOut.Value = $hits
  return $null
}

$root = (Resolve-Path $ProjectRoot).Path
$descPath = Join-Path $root $DescFile
if (-not (Test-Path $descPath)) { throw "Desc file not found: $descPath" }

$desc = Normalize-Newlines (Read-AllTextUtf8 $descPath)

# Parse blocks
$blockRx = [regex]::new('(?ms)^\s*//\s*(?<path>src\/app\/api\/[^\r\n]+\/route\.ts)\s*\n(?<comment>/\*.*?\*/)\s*(?:\n|$)', 'IgnoreCase')
$matches = $blockRx.Matches($desc)
if ($matches.Count -eq 0) {
  throw "No blocks found. Expected format: `// src/app/api/.../route.ts` then `/* ... */`."
}

Write-Host "ProjectRoot: $root"
Write-Host "Blocks in desc: $($matches.Count)"
if ($Strict)   { Write-Host "Strict mode: ON" }
if ($DryRun)   { Write-Host "DryRun mode: ON" }
if ($Diagnose) { Write-Host "Diagnose mode: ON" }

$updated = 0
$skipped = 0
$missing = 0
$errors = 0
$strictFailed = 0

foreach ($m in $matches) {
  $relPath = Clean-PathFromDesc $m.Groups["path"].Value
  $comment = (Strip-WeirdUnicode $m.Groups["comment"].Value).Trim()

  $debug = $null
  $filePath = Resolve-ApiFilePath $root $relPath ([ref]$debug)

  if (-not $filePath) {
    Write-Warning "Missing file: $relPath"
    if ($Diagnose) {
      Write-Host "  Candidates:"
      foreach ($row in $debug) { Write-Host ("    - {0}  exists={1}" -f $row.candidate, $row.exists) }
      Write-Host ""
    }
    $missing++
    continue
  }

  try {
    $fileText = Normalize-Newlines (Read-AllTextUtf8 $filePath)
    $lines = $fileText -split "`n", -1
    $firstLine = if ($lines.Count -gt 0) { $lines[0] } else { "" }

    if ($Strict) {
      $expected = "// $relPath"
      $a = Normalize-ForCompare $firstLine
      $b = Normalize-ForCompare $expected

      if ($a -ne $b) {
        Write-Warning "[STRICT FAIL] $relPath"
        Write-Warning "  Expected: $expected"
        Write-Warning "  Actual:   $firstLine"
        $strictFailed++

        if ($Diagnose) {
          Write-Host "  --- STRICT DIAG ---"
          Write-Host "  Expected len(raw): $($expected.Length)   Actual len(raw): $($firstLine.Length)"
          Write-Host "  Expected codepoints(raw): $(To-Codepoints $expected)"
          Write-Host "  Actual   codepoints(raw): $(To-Codepoints $firstLine)"
          Write-Host "  Expected(norm): [$b]"
          Write-Host "  Actual  (norm): [$a]"
          Write-Host "  Expected len(norm): $($b.Length)   Actual len(norm): $($a.Length)"
          Write-Host "  File resolved to: $filePath"
          Write-Host "  -------------------"
          Write-Host ""
        }

        continue
      }
    }

    # tail from 2nd line
    $rest = ""
    if ($lines.Count -gt 1) { $rest = ($lines[1..($lines.Count-1)] -join "`n") }

    # keep leading blank lines after line1
    $leadWsRx = [regex]::new('^(?<lead>(?:\s*\n)*)', 'Singleline')
    $leadMatch = $leadWsRx.Match($rest)
    $lead = $leadMatch.Groups["lead"].Value
    $afterLead = $rest.Substring($lead.Length)

    # replace existing /*...*/ if it starts right after leading blanks
    $existingCommentRx = [regex]::new('^(?<c>/\*.*?\*/)\s*(?:\n)?', 'Singleline')
    $cm = $existingCommentRx.Match($afterLead)
    if ($cm.Success) { $afterLead = $afterLead.Substring($cm.Length) }

    $newText = $firstLine + "`n" + $comment + "`n`n" + $lead + $afterLead
    $newText = $newText.TrimEnd() + "`n"

    $currentNormalized = $fileText.TrimEnd() + "`n"
    if ($newText -eq $currentNormalized) {
      Write-Host "[SKIP] $relPath"
      $skipped++
      continue
    }

    if ($DryRun) {
      Write-Host "[DRY] would update: $relPath"
      if ($Diagnose) { Write-Host "      resolved path: $filePath" }
      $updated++
      continue
    }

    Write-AllTextUtf8NoBom $filePath $newText
    Write-Host "[OK] updated: $relPath"
    $updated++
  }
  catch {
    Write-Warning "[ERR] $relPath -> $($_.Exception.Message)"
    $errors++
  }
}

Write-Host ""
Write-Host "Done."
Write-Host "Updated:       $updated"
Write-Host "Skipped:       $skipped"
Write-Host "Missing:       $missing"
Write-Host "Strict failed: $strictFailed"
Write-Host "Errors:        $errors"
if ($DryRun) { Write-Host "DryRun mode: no files were modified." }