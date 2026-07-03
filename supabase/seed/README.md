# Disposable role fixtures

`create-role-fixtures.ts` creates one isolated restaurant plus owner, manager
and employee accounts for development/staging acceptance tests. It deletes and
recreates only the three explicit `+restogogo-fixture@example.com` users.

Run only against a disposable project:

```powershell
$env:SUPABASE_URL='https://PROJECT.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='...'
$env:FIXTURE_PASSWORD='a-long-disposable-password'
$env:ALLOW_DESTRUCTIVE_FIXTURES='YES'
deno run --allow-env --allow-net supabase/seed/create-role-fixtures.ts
```

Never set `ALLOW_DESTRUCTIVE_FIXTURES=YES` with production credentials.
