param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^\s@]+@[^\s@]+\.[^\s@]+$')]
  [string]$Email
)

$ErrorActionPreference = 'Stop'
$escapedEmail = $Email.Trim().ToLowerInvariant().Replace("'", "''")
$tempSqlPath = $null

$sql = @"
do `$provision`$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id
  from public.profiles
  where lower(email::text) = '$escapedEmail';

  if v_profile_id is null then
    raise exception 'No Restogogo profile exists for the requested email.';
  end if;

  insert into public.platform_admins (profile_id, note)
  values (v_profile_id, 'Explicitly provisioned by the deployment operator.')
  on conflict (profile_id) do update
    set note = excluded.note;
end
`$provision`$;

select p.id, p.email, a.created_at
from public.platform_admins a
join public.profiles p on p.id = a.profile_id
where lower(p.email::text) = '$escapedEmail';
"@

try {
  $tempSqlPath = Join-Path ([IO.Path]::GetTempPath()) "restogogo-admin-$([guid]::NewGuid()).sql"
  [IO.File]::WriteAllText($tempSqlPath, $sql, [Text.UTF8Encoding]::new($false))
  $output = (& npx supabase db query --linked --file $tempSqlPath | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Platform administrator provisioning failed.' }
  $result = $output | ConvertFrom-Json
  if (-not $result.rows -or $result.rows.Count -ne 1) {
    throw 'Platform administrator provisioning returned no confirmed profile.'
  }
  Write-Host "Platform administrator provisioned for $($result.rows[0].email)."
} finally {
  if ($tempSqlPath -and (Test-Path -LiteralPath $tempSqlPath)) {
    Remove-Item -LiteralPath $tempSqlPath -Force
  }
  $sql = $null
}

