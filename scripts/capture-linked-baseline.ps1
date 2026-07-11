param(
  [Parameter(Mandatory = $true)]
  [string]$PgDumpPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $PgDumpPath -PathType Leaf)) {
  throw 'PgDumpPath must point to pg_dump.exe.'
}
$version = (& $PgDumpPath --version | Out-String)
if ($LASTEXITCODE -ne 0 -or $version -notmatch 'pg_dump \(PostgreSQL\) 17\.') {
  throw 'PostgreSQL 17 pg_dump is required for the current Supabase database.'
}

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$dryRun = (& npx supabase db dump --linked --schema public --dry-run 2>$null | Out-String)
$dryRunExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorPreference
if ($dryRunExitCode -ne 0) {
  throw 'Supabase could not create a temporary linked-database login.'
}
$connection = @{}
[regex]::Matches($dryRun, 'export\s+(PG\w+)="([^"]*)"') | ForEach-Object {
  $connection[$_.Groups[1].Value] = $_.Groups[2].Value
}
$required = @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')
if (($required | Where-Object { -not $connection.ContainsKey($_) }).Count) {
  throw 'The Supabase dump recipe did not contain a complete temporary connection.'
}

$rawPath = Join-Path ([IO.Path]::GetTempPath()) ('restogogo-baseline-' + [guid]::NewGuid() + '.sql')
try {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = (Resolve-Path -LiteralPath $PgDumpPath).Path
  $start.Arguments = '--schema-only --quote-all-identifiers --role "postgres" --schema=public'
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($name in $required) {
    $start.EnvironmentVariables[$name] = $connection[$name]
  }

  $process = [Diagnostics.Process]::Start($start)
  $stream = [IO.File]::Create($rawPath)
  $process.StandardOutput.BaseStream.CopyTo($stream)
  $stream.Dispose()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "pg_dump failed: $stderr"
  }

  $raw = [IO.File]::ReadAllText($rawPath, [Text.Encoding]::UTF8)
  $filtered = foreach ($line in ($raw -split "`r?`n")) {
    if ($line -match '^\\(?:un)?restrict\s' -or $line -eq 'SET transaction_timeout = 0;') {
      continue
    }
    if ($line -match '^--') {
      continue
    }
    $line = $line -replace '^CREATE SCHEMA "', 'CREATE SCHEMA IF NOT EXISTS "'
    $line = $line -replace '^CREATE TABLE "', 'CREATE TABLE IF NOT EXISTS "'
    $line = $line -replace '^CREATE SEQUENCE "', 'CREATE SEQUENCE IF NOT EXISTS "'
    $line = $line -replace '^CREATE VIEW "', 'CREATE OR REPLACE VIEW "'
    $line = $line -replace '^CREATE FUNCTION "', 'CREATE OR REPLACE FUNCTION "'
    $line = $line -replace '^CREATE TRIGGER "', 'CREATE OR REPLACE TRIGGER "'
    $line
  }

  $output = (($filtered -join "`n").Trim() + "`n")
  $encodingMarkers = @([char]0x00c3, [char]0x00e2, [char]0x00c2, [char]0xfffd)
  $hasEncodingMarker = $encodingMarkers | Where-Object { $output.Contains($_) }
  if ($hasEncodingMarker -or $output.Contains($connection['PGPASSWORD'])) {
    throw 'The captured baseline contains invalid encoding or credential material.'
  }
  if ([regex]::Matches($output, '(?m)^CREATE TABLE IF NOT EXISTS ').Count -lt 40) {
    throw 'The captured public schema is unexpectedly incomplete.'
  }

  $target = Join-Path (Resolve-Path 'supabase/baseline') 'public.sql'
  [IO.File]::WriteAllText($target, $output, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Captured the linked public schema in supabase/baseline/public.sql.'
} finally {
  if (Test-Path -LiteralPath $rawPath) {
    Remove-Item -LiteralPath $rawPath -Force
  }
}
