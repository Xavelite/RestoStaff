$ErrorActionPreference = 'Stop'

function Invoke-Supabase {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx supabase @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase command failed: npx supabase $($Arguments -join ' ')"
  }
}

Write-Host 'Checking linked migration ledger...'
Invoke-Supabase migration list --linked

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
  'model_integrity_contract.sql',
  'notification_payroll_contract.sql'
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
