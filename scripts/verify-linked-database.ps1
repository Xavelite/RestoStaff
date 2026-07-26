$ErrorActionPreference = 'Stop'

function Invoke-Supabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx supabase @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase command failed: npx supabase $($Arguments -join ' ')"
  }
}

function Assert-MigrationLedgerParity {
  Write-Host 'Checking linked migration ledger...'
  $ledgerOutput = (& npx supabase migration list --linked 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase migration list failed.`n$ledgerOutput"
  }

  Write-Host $ledgerOutput.TrimEnd()

  $local = [System.Collections.Generic.HashSet[string]]::new()
  $remote = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($line in ($ledgerOutput -split "`r?`n")) {
    if ($line -match '^\s*(\d{8,14})?\s*\|\s*(\d{8,14})?\s*\|') {
      if ($Matches[1]) { [void]$local.Add($Matches[1]) }
      if ($Matches[2]) { [void]$remote.Add($Matches[2]) }
    }
  }

  if ($local.Count -eq 0 -or $remote.Count -eq 0) {
    throw 'Migration ledger output could not be parsed. Refusing to continue with an unverified linked database.'
  }

  $localOnly = @($local | Where-Object { -not $remote.Contains($_) } | Sort-Object)
  $remoteOnly = @($remote | Where-Object { -not $local.Contains($_) } | Sort-Object)
  if ($localOnly.Count -gt 0 -or $remoteOnly.Count -gt 0) {
    $details = @()
    if ($localOnly.Count -gt 0) {
      $details += "Local only / not applied: $($localOnly -join ', ')"
    }
    if ($remoteOnly.Count -gt 0) {
      $details += "Remote only / missing locally: $($remoteOnly -join ', ')"
    }
    throw "Linked migration ledger is not in exact parity.`n$($details -join "`n")"
  }

  Write-Host "Migration ledger parity confirmed ($($local.Count) versions)."
}

Assert-MigrationLedgerParity

Write-Host 'Executing non-persistent security and workflow contracts...'
Invoke-Supabase db query --linked --file supabase/tests/security_contract.sql
Invoke-Supabase db query --linked --file supabase/tests/canonical_schema_security.sql
Invoke-Supabase db query --linked --file supabase/tests/realtime_and_catalog_contract.sql
$workflowContracts = @(
  'badge_operations_contract.sql',
  'work_pattern_contract.sql',
  'access_lifecycle_contract.sql',
  'schedule_timesheet_lifecycle_contract.sql',
  'availability_lifecycle_contract.sql',
  'focused_read_models_contract.sql',
  'payroll_export_contract.sql',
  'payroll_engine_contract.sql',
  'employment_derivation_contract.sql',
  'model_integrity_contract.sql',
  'notification_payroll_contract.sql',
  'push_notification_contract.sql',
  'reservation_contract.sql'
)
foreach ($contract in $workflowContracts) {
  Invoke-Supabase db query --linked --file "supabase/tests/$contract"
}

Write-Host 'Linting the public schema...'
Invoke-Supabase db lint --linked --schema public --level error

Write-Host 'Comparing generated public types...'
$generated = (& npx supabase gen types typescript --linked --schema public | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw 'Supabase type generation failed.'
}
$generated = $generated.Replace("`r`n", "`n").TrimEnd()
$committed = (Get-Content -Raw src/lib/supabase/database.types.ts).Replace("`r`n", "`n").TrimEnd()
if ($generated -cne $committed) {
  throw 'src/lib/supabase/database.types.ts differs from the linked public schema.'
}

Write-Host 'Linked database contracts and generated public types are aligned.'
