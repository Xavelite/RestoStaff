param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z]{20}$')]
  [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'

if ($env:ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP -ne 'YES') {
  throw 'Set ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP=YES for an explicitly disposable target.'
}
if (-not $env:SUPABASE_DB_PASSWORD) {
  throw 'Set SUPABASE_DB_PASSWORD for the disposable hosted project.'
}

$projectsJson = (& npx supabase projects list -o json | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw 'Supabase project discovery failed.'
}
$targetProject = ($projectsJson | ConvertFrom-Json) |
  Where-Object { $_.id -eq $ProjectRef } |
  Select-Object -First 1
if (-not $targetProject -or $targetProject.name -notmatch '^restogogo-acceptance-') {
  throw 'Refusing a target that is not an explicitly named Restogogo acceptance project.'
}

$linkedRefPath = 'supabase/.temp/project-ref'
if (Test-Path -LiteralPath $linkedRefPath) {
  $linkedRef = (Get-Content -Raw $linkedRefPath).Trim()
  if ($linkedRef -and $ProjectRef -eq $linkedRef) {
    throw 'Refusing to bootstrap the currently linked development project.'
  }
}

$repositoryRoot = (Resolve-Path '.').Path
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('restogogo-bootstrap-' + [guid]::NewGuid())
$temporarySupabase = Join-Path $temporaryRoot 'supabase'

function Invoke-TemporarySupabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx supabase --workdir $temporaryRoot @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw 'A Supabase bootstrap command failed.'
  }
}

function Invoke-SqlFile {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  $absolutePath = Join-Path $repositoryRoot $RelativePath
  Invoke-TemporarySupabase db query --linked --file $absolutePath
}

try {
  New-Item -ItemType Directory -Path $temporarySupabase -Force | Out-Null
  Copy-Item -LiteralPath 'supabase/config.toml' -Destination (Join-Path $temporarySupabase 'config.toml')
  Copy-Item -LiteralPath 'supabase/migrations' -Destination $temporarySupabase -Recurse
  Invoke-TemporarySupabase link --project-ref $ProjectRef --password $env:SUPABASE_DB_PASSWORD

  Write-Host 'Confirming the target has no Restogogo schema...'
  Invoke-SqlFile 'supabase/baseline/assert-empty.sql'

  Write-Host 'Initializing the hosted Realtime authorization schema...'
  $keysJson = (& npx supabase projects api-keys --project-ref $ProjectRef --reveal -o json | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw 'Supabase API key discovery failed.'
  }
  $apiKeys = $keysJson | ConvertFrom-Json
  $realtimeBootstrapKey = ($apiKeys |
    Where-Object { $_.name -eq 'anon' -and $_.type -eq 'legacy' } |
    Select-Object -First 1).api_key
  if (-not $realtimeBootstrapKey) {
    $realtimeBootstrapKey = ($apiKeys |
      Where-Object { $_.type -eq 'publishable' } |
      Select-Object -First 1).api_key
  }
  if (-not $realtimeBootstrapKey) {
    throw 'The disposable project has no browser-safe API key.'
  }
  $env:RESTOGOGO_BOOTSTRAP_SUPABASE_URL = "https://$ProjectRef.supabase.co"
  $env:RESTOGOGO_BOOTSTRAP_API_KEY = $realtimeBootstrapKey
  try {
    & node (Join-Path $repositoryRoot 'scripts/initialize-hosted-realtime.mjs')
    if ($LASTEXITCODE -ne 0) {
      throw 'Hosted Realtime initialization failed.'
    }
  } finally {
    Remove-Item Env:RESTOGOGO_BOOTSTRAP_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:RESTOGOGO_BOOTSTRAP_API_KEY -ErrorAction SilentlyContinue
  }

  Write-Host 'Applying fresh-project prerequisites...'
  Invoke-SqlFile 'supabase/baseline/prerequisites.sql'
  Invoke-SqlFile 'supabase/baseline/public.sql'
  Invoke-SqlFile 'supabase/baseline/platform.sql'
  Invoke-SqlFile 'supabase/baseline/seed.sql'

  $cutoff = (Get-Content -Raw 'supabase/baseline/cutoff.txt').Trim()
  $versions = Get-ChildItem 'supabase/migrations' -Filter '*.sql' |
    ForEach-Object { [regex]::Match($_.Name, '^(\d+)_').Groups[1].Value } |
    Where-Object { $_ -and $_ -le $cutoff } |
    Sort-Object -Unique
  if (-not $versions.Count -or $versions[-1] -ne $cutoff) {
    throw 'The baseline cutoff does not match the migration directory.'
  }

  Write-Host "Recording the reviewed migration cutoff $cutoff..."
  Invoke-TemporarySupabase migration repair @versions --status applied --linked --yes

  Write-Host 'Applying migrations newer than the baseline cutoff...'
  Invoke-TemporarySupabase db push --linked --include-all --yes

  $contracts = @(
    'security_contract.sql',
    'canonical_schema_security.sql',
    'realtime_and_catalog_contract.sql',
    'badge_operations_contract.sql',
    'work_pattern_contract.sql',
    'access_lifecycle_contract.sql',
    'schedule_timesheet_lifecycle_contract.sql',
    'availability_lifecycle_contract.sql',
    'focused_read_models_contract.sql',
    'payroll_export_contract.sql',
    'model_integrity_contract.sql',
    'notification_payroll_contract.sql'
  )

  Write-Host 'Executing rollback-contained security and workflow contracts...'
  foreach ($contract in $contracts) {
    Invoke-SqlFile "supabase/tests/$contract"
  }

  Write-Host 'Linting the disposable public schema...'
  Invoke-TemporarySupabase db lint --linked --schema public --level error

  Write-Host 'Comparing generated public types...'
  $generated = (& npx supabase gen types typescript --project-id $ProjectRef --schema public | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw 'Supabase type generation failed.'
  }
  $generated = $generated.Replace("`r`n", "`n").TrimEnd()
  $committed = (Get-Content -Raw 'src/lib/supabase/database.types.ts').Replace("`r`n", "`n").TrimEnd()
  if ($generated -cne $committed) {
    throw 'Generated public types differ from src/lib/supabase/database.types.ts.'
  }

  Write-Host 'Disposable Restogogo bootstrap and all database contracts passed.'
} finally {
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedTarget = [IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedTarget.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedTarget)) {
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  }
}
