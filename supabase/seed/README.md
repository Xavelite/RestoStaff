# Disposable role fixtures

`create-role-fixtures.ts` creates one isolated restaurant plus Owner, Manager
and Employee accounts for hosted acceptance tests. It exercises the real Owner
workspace setup RPC, then attaches the two secondary role identities. Run it
once on a fresh disposable project; it refuses to replace an existing fixture
restaurant.

Run only against a disposable project:

```powershell
$env:SUPABASE_URL='https://PROJECT.supabase.co'
$env:SUPABASE_ANON_KEY='...'
$env:SUPABASE_SERVICE_ROLE_KEY='...'
$env:FIXTURE_PASSWORD='a-long-disposable-password'
$env:FIXTURE_PROJECT_NAME='restogogo-acceptance-...'
$env:ALLOW_DESTRUCTIVE_FIXTURES='YES'
deno run --allow-env --allow-net supabase/seed/create-role-fixtures.ts
```

Never set `ALLOW_DESTRUCTIVE_FIXTURES=YES` with production credentials.

The canonical lifecycle is:

```powershell
npm run verify:hosted:disposable -- -OrganizationId '<ORGANIZATION_ID>'
```

It creates, validates, and deletes the hosted project without printing fixture
credentials.
