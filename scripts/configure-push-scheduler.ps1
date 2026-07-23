param(
  [ValidatePattern('^[a-z]{20}$')]
  [string]$ProjectRef,
  [string]$ProjectUrl,
  [string]$DispatchSecret,
  [string]$Schedule = '* * * * *'
)

$ErrorActionPreference = 'Stop'
$secretName = 'restogogo_push_dispatch_secret'
$urlName = 'restogogo_push_project_url'
$jobName = 'restogogo-push-dispatch'
$tempSqlPath = $null
$temporaryRoot = $null

function Invoke-Supabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $prefix = if ($temporaryRoot) { @('--workdir', $temporaryRoot) } else { @() }
  $output = (& npx supabase @prefix @Arguments | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'A Supabase scheduler command failed.' }
  return $output
}

function New-DispatchSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Read-LocalProjectUrl {
  if (-not (Test-Path -LiteralPath '.env')) { return $null }
  $line = Get-Content -LiteralPath '.env' |
    Where-Object { $_ -match '^PUBLIC_SUPABASE_URL=' } |
    Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim()
}

if (-not $ProjectUrl) { $ProjectUrl = Read-LocalProjectUrl }
if (-not $DispatchSecret) { $DispatchSecret = $env:PUSH_DISPATCH_SECRET }
if (-not $DispatchSecret) { $DispatchSecret = New-DispatchSecret }

$ProjectUrl = $ProjectUrl.TrimEnd('/')
if ($ProjectUrl -notmatch '^https://[a-z0-9-]+\.supabase\.co$') {
  throw 'ProjectUrl must be an HTTPS Supabase project URL.'
}
if ($DispatchSecret -notmatch '^[A-Za-z0-9_-]{32,128}$') {
  throw 'DispatchSecret must be a 32-128 character base64url value.'
}
if (-not $Schedule -or $Schedule.Length -gt 80 -or $Schedule -match "[\r\n']") {
  throw 'Schedule must be a valid single-line Cron expression.'
}

if ($ProjectRef) {
  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('restogogo-push-project-' + [guid]::NewGuid())
  $temporarySupabase = Join-Path $temporaryRoot 'supabase'
  New-Item -ItemType Directory -Path (Join-Path $temporarySupabase '.temp') -Force | Out-Null
  Copy-Item -LiteralPath 'supabase/config.toml' -Destination (Join-Path $temporarySupabase 'config.toml')
  [IO.File]::WriteAllText(
    (Join-Path $temporarySupabase '.temp/project-ref'),
    $ProjectRef,
    [Text.UTF8Encoding]::new($false)
  )
}

$escapedUrl = $ProjectUrl.Replace("'", "''")
$escapedSecret = $DispatchSecret.Replace("'", "''")
$escapedSchedule = $Schedule.Replace("'", "''")

$sqlTemplate = @'
do $configure$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = '__URL_NAME__';
  if v_id is null then
    perform vault.create_secret('__PROJECT_URL__', '__URL_NAME__', 'Restogogo Edge Function base URL');
  else
    perform vault.update_secret(v_id, '__PROJECT_URL__', '__URL_NAME__', 'Restogogo Edge Function base URL');
  end if;

  select id into v_id from vault.secrets where name = '__SECRET_NAME__';
  if v_id is null then
    perform vault.create_secret('__DISPATCH_SECRET__', '__SECRET_NAME__', 'Restogogo push scheduler credential');
  else
    perform vault.update_secret(v_id, '__DISPATCH_SECRET__', '__SECRET_NAME__', 'Restogogo push scheduler credential');
  end if;
end
$configure$;

select cron.schedule(
  '__JOB_NAME__',
  '__SCHEDULE__',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = '__URL_NAME__') || '/functions/v1/dispatch-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-restogogo-push-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = '__SECRET_NAME__')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $job$
) as job_id;

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '__URL_NAME__') || '/functions/v1/dispatch-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-restogogo-push-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = '__SECRET_NAME__')
  ),
  body := '{"dry_run":true}'::jsonb
) as verification_request_id;
'@

$sql = $sqlTemplate.
  Replace('__PROJECT_URL__', $escapedUrl).
  Replace('__DISPATCH_SECRET__', $escapedSecret).
  Replace('__SCHEDULE__', $escapedSchedule).
  Replace('__URL_NAME__', $urlName).
  Replace('__SECRET_NAME__', $secretName).
  Replace('__JOB_NAME__', $jobName)

try {
  Write-Host 'Synchronizing the Edge dispatch secret...'
  if ($ProjectRef) {
    Invoke-Supabase secrets set "PUSH_DISPATCH_SECRET=$DispatchSecret" --project-ref $ProjectRef | Out-Null
  } else {
    Invoke-Supabase secrets set "PUSH_DISPATCH_SECRET=$DispatchSecret" | Out-Null
  }

  $tempSqlPath = Join-Path ([IO.Path]::GetTempPath()) "restogogo-push-$([guid]::NewGuid()).sql"
  [IO.File]::WriteAllText($tempSqlPath, $sql, [Text.UTF8Encoding]::new($false))
  Write-Host "Scheduling push dispatch with '$Schedule'..."
  $configured = Invoke-Supabase db query --linked --file $tempSqlPath | ConvertFrom-Json
  $requestId = ($configured.rows | Where-Object { $_.verification_request_id } |
    Select-Object -Last 1).verification_request_id
  if (-not $requestId) { throw 'The database did not enqueue the scheduler verification request.' }

  $verified = $false
  for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
    Start-Sleep -Seconds 1
    $response = Invoke-Supabase db query --linked `
      "select status_code, timed_out, error_msg, content::text from net._http_response where id = $requestId;" |
      ConvertFrom-Json
    $row = $response.rows | Select-Object -First 1
    if (-not $row) { continue }
    if ($row.status_code -ne 200 -or $row.timed_out -or $row.error_msg) {
      throw "The database-to-Edge verification failed with HTTP $($row.status_code): $($row.error_msg)"
    }
    $body = $row.content | ConvertFrom-Json
    if (-not $body.ok -or -not $body.dry_run) {
      throw 'The push dispatcher returned an invalid verification response.'
    }
    $verified = $true
    break
  }
  if (-not $verified) { throw 'The database-to-Edge verification timed out.' }

  Write-Host 'Push scheduler configured and database-to-Edge dry run passed.'
} finally {
  if ($tempSqlPath -and (Test-Path -LiteralPath $tempSqlPath)) {
    Remove-Item -LiteralPath $tempSqlPath -Force
  }
  if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedTarget = [IO.Path]::GetFullPath($temporaryRoot)
    if ($resolvedTarget.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
  }
  $DispatchSecret = $null
  $escapedSecret = $null
  $sql = $null
}
