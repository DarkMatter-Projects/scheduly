# Hosted setup

Use the separate workspace entry; the legacy deployment is unchanged.

Required client environment values:

```dotenv
VITE_WORKSPACE_API_URL=https://vymziezvqzpnxydakwmc.supabase.co/functions/v1/workspace
VITE_WORKSPACE_SUPABASE_URL=https://vymziezvqzpnxydakwmc.supabase.co
VITE_WORKSPACE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Run `npx vite --config vite.workspace.config.js --mode hosted --port 5176`. Local settings are in ignored `.env.hosted.local`.

Function source is `supabase/functions/workspace/index.ts`. Deploy with its `deno.json`, `deno.lock` and the relative `platform/src/` dependencies. It uses platform-provided database and Auth environment values. Its body validates bearer tokens; the deployment uses custom authentication instead of legacy gateway JWT checking. Set `SCHEDULY_ALLOWED_ORIGINS` to the exact HTTPS frontend origin at deployment. Do not add wildcard origins.

The private schema has no direct Data API permissions. Do not grant blanket table access to fix an application error. Publishing is disabled in the gateway until provider acceptance and worker verification are complete. Do not run the local seed or reconciliation timer against the hosted database.

Rollback: withdraw the new frontend deployment and disable/redeploy the gateway, leaving the additive private schema intact. No legacy database or application requires changes to roll back this foundation. A schema transaction rollback was tested locally before deployment; do not drop a populated hosted schema.
