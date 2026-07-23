param(
  [Parameter(Mandatory = $true)]
  [string]$OrganizationId,
  [ValidateSet('eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3')]
  [string]$Region = 'eu-west-1',
  [string]$AppOrigin = 'http://127.0.0.1:5555'
)

$ErrorActionPreference = 'Stop'
$projectName = 'restogogo-acceptance-' + (Get-Date -Format 'yyyyMMddHHmmss')
$projectRef = $null
$secretNames = @(
  'SUPABASE_DB_PASSWORD', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'FIXTURE_PASSWORD', 'FIXTURE_RESTAURANT_ID',
  'FIXTURE_PROJECT_NAME', 'ACCEPTANCE_PROJECT_NAME', 'APP_ORIGIN',
  'PUSH_DISPATCH_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP', 'ALLOW_DESTRUCTIVE_FIXTURES',
  'ALLOW_HOSTED_ACCEPTANCE'
)

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return ([Convert]::ToBase64String($bytes)).Replace('+', 'A').Replace('/', 'b') + '!9a'
}

function Invoke-Supabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $output = (& npx supabase @Arguments | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'A Supabase acceptance command failed.' }
  return $output
}

$databasePassword = New-RandomSecret
$fixturePassword = New-RandomSecret

try {
  Write-Host "Creating disposable hosted project $projectName..."
  $created = Invoke-Supabase projects create $projectName --org-id $OrganizationId `
    --db-password $databasePassword --region $Region --size nano '-o' 'json' | ConvertFrom-Json
  $projectRef = if ($created.id) { $created.id } else { $created.ref }
  if (-not $projectRef -or $projectRef -notmatch '^[a-z]{20}$') {
    throw 'Supabase did not return a valid disposable project ref.'
  }

  $linkedRefPath = 'supabase/.temp/project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linkedRef = (Get-Content -Raw $linkedRefPath).Trim()
    if ($linkedRef -eq $projectRef) { throw 'Refusing the linked development project.' }
  }

  Write-Host 'Waiting for hosted database health...'
  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    $projects = Invoke-Supabase projects list '-o' 'json' | ConvertFrom-Json
    $project = $projects | Where-Object { $_.id -eq $projectRef } | Select-Object -First 1
    if ($project.status -eq 'ACTIVE_HEALTHY') { $healthy = $true; break }
    Start-Sleep -Seconds 10
  }
  if (-not $healthy) { throw 'Disposable project did not become healthy in time.' }

  $env:ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP = 'YES'
  $env:SUPABASE_DB_PASSWORD = $databasePassword
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-disposable-database.ps1 `
    -ProjectRef $projectRef
  if ($LASTEXITCODE -ne 0) { throw 'Empty-project bootstrap failed.' }

  $keys = Invoke-Supabase projects api-keys --project-ref $projectRef --reveal '-o' 'json' |
    ConvertFrom-Json
  $anonKey = ($keys | Where-Object { $_.name -eq 'anon' -and $_.type -eq 'legacy' } |
    Select-Object -First 1).api_key
  if (-not $anonKey) {
    $anonKey = ($keys | Where-Object { $_.type -eq 'publishable' } |
      Select-Object -First 1).api_key
  }
  $serviceRoleKey = ($keys |
    Where-Object { $_.name -eq 'service_role' -and $_.type -eq 'legacy' } |
    Select-Object -First 1).api_key
  if (-not $anonKey -or -not $serviceRoleKey) { throw 'Required project keys are missing.' }

  $env:SUPABASE_URL = "https://$projectRef.supabase.co"
  $env:SUPABASE_ANON_KEY = $anonKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
  $env:FIXTURE_PASSWORD = $fixturePassword
  $env:FIXTURE_PROJECT_NAME = $projectName
  $env:ALLOW_DESTRUCTIVE_FIXTURES = 'YES'
  Write-Host 'Creating disposable managed-Auth role fixtures...'
  $fixtureOutput = (& npx --no-install deno run --allow-env --allow-net `
    supabase/seed/create-role-fixtures.ts | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Role fixture creation failed.' }
  $fixtureJson = [regex]::Match($fixtureOutput, '\{[\s\S]*\}').Value | ConvertFrom-Json
  if (-not $fixtureJson.restaurantId) { throw 'Fixture creation returned no restaurant id.' }

  Write-Host 'Configuring and deploying disposable Edge Functions...'
  $pushKeys = (& node scripts/generate-web-push-keys.mjs | Out-String) | ConvertFrom-Json
  $env:PUSH_DISPATCH_SECRET = $pushKeys.dispatchSecret
  $env:VAPID_PUBLIC_KEY = $pushKeys.publicKey
  $env:VAPID_PRIVATE_KEY = $pushKeys.privateKey
  $env:VAPID_SUBJECT = 'mailto:acceptance@restogogo.invalid'
  Invoke-Supabase secrets set --project-ref $projectRef `
    "APP_ORIGIN=$AppOrigin" `
    "PUSH_DISPATCH_SECRET=$($env:PUSH_DISPATCH_SECRET)" `
    "VAPID_PUBLIC_KEY=$($env:VAPID_PUBLIC_KEY)" `
    "VAPID_PRIVATE_KEY=$($env:VAPID_PRIVATE_KEY)" `
    "VAPID_SUBJECT=$($env:VAPID_SUBJECT)" | Out-Null
  Invoke-Supabase functions deploy send-employee-invitation upload-badge-proof `
    get-badge-proof dispatch-push --project-ref $projectRef --use-api | Out-Null

  $env:FIXTURE_RESTAURANT_ID = $fixtureJson.restaurantId
  $env:APP_ORIGIN = $AppOrigin
  $env:ACCEPTANCE_PROJECT_NAME = $projectName
  $env:ALLOW_HOSTED_ACCEPTANCE = 'YES'
  Write-Host 'Running managed Auth, role, Realtime, Edge, and Storage acceptance...'
  & node scripts/verify-hosted-acceptance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Hosted acceptance failed.' }
  Write-Host 'Disposable hosted acceptance passed.'
} finally {
  foreach ($name in $secretNames) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $databasePassword = $null
  $fixturePassword = $null
  if (-not $projectRef) {
    try {
      $projects = Invoke-Supabase projects list '-o' 'json' | ConvertFrom-Json
      $projectRef = ($projects | Where-Object { $_.name -eq $projectName } |
        Select-Object -First 1).id
    } catch {
      Write-Warning 'Could not confirm whether project creation completed.'
    }
  }
  if ($projectRef) {
    Write-Host 'Deleting the disposable hosted project...'
    & npx supabase projects delete $projectRef --yes | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Automatic cleanup failed for disposable project $projectRef."
    }
  }
}
