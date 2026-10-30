# Isolated TrustLens-LCU deployment

Create a separate free Convex project named **TrustLens-LCU** for the `LCU`
branch. Keep the original project's production deployment and its frontend
configuration in place.

## Completed setup

- Created project `anirudh-upadhyay:trustlens-lcu` through the Convex dashboard.
- Created its default production deployment `outstanding-falcon-217`.
- Deployed the LCU backend to <https://outstanding-falcon-217.convex.cloud>.
- Generated fresh authentication keys; privately copied the five existing
  provider/sender settings required by the existing optional integrations.
- Set the new backend's local-test `SITE_URL` to `http://127.0.0.1:5174`.
- Configured the shared laptop model on the explicit new production target.
- Verified fresh guest sign-in, ready v4/v5 models, and a completed synthetic
  recording check through the new production Convex action.
- Verified the isolated frontend on port 5174 uses the new backend URL.
- Verified the root `.env.local` checksum is unchanged. No old users or call
  history were imported, and no commands changed the original production backend.

The local deployment selector is `runtime/lcu.env` (gitignored). Runtime process
IDs and logs are under `runtime/isolated-*`; do not commit the runtime directory.

Restart the model connection with:

```powershell
.\tl_model_lcu\Start.cmd --deployment anirudh-upadhyay:trustlens-lcu:production
```

Restart the isolated frontend in a different terminal with:

```powershell
$env:VITE_CONVEX_URL = "https://outstanding-falcon-217.convex.cloud"
$env:VITE_CONVEX_SITE_URL = "https://outstanding-falcon-217.convex.site"
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

A separate publicly hosted LCU frontend has not been configured in this setup.
When hosting it, use the new production URL above and update **this new
deployment's** `SITE_URL` to match the hosted frontend origin.

## Sequence

1. Inspect the authenticated Convex dashboard and create the new project on
   the existing free team. Do not upgrade billing or change the old project's
   default deployment.
2. Record the new project/deployment identifiers in a separate gitignored
   environment file under `tl_model_lcu/runtime/`. Keep the existing root
   `.env.local` intact. Use explicit targets for all subsequent commands.
3. Generate a fresh `JWT_PRIVATE_KEY`/`JWKS` pair for LCU authentication. Copy
   existing provider configuration only where needed, through local tooling
   without printing or committing secret values. Set `SITE_URL` for the LCU
   frontend; use the new deployment's own Convex URLs.
4. Deploy the existing `LCU` source by reference to the new backend. The new
   database starts separately; do not copy production users or call history.
5. Configure the laptop gateway's HTTPS endpoint and private service credential
   on the new backend with an explicit deployment target. Reuse the existing
   model files, Python environment, gateway and tunnel.
6. Start an LCU frontend with the new backend URL in an isolated process/file.
   Verify guest sign-in, detector readiness and a synthetic recording check.
   Keep the old hosted frontend pointing at its original backend.
7. Record the verified URLs and exact restart/deploy commands. A separate hosted
   LCU frontend is the next publishing step once the isolated backend works.

## Checks

- New deployment belongs to TrustLens-LCU; old production is not the target.
- Root `.env.local` is unchanged.
- Sign-in keys are distinct; credentials stay in ignored runtime/backend state.
- Schema/functions deploy and the new deployment has independent data.
- Convex reports the model ready and can complete a test check.
- Laptop sleep/tunnel interruption is still an availability limitation. A
  temporary Quick Tunnel is for testing, not an uptime guarantee.
