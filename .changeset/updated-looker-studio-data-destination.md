---
'owox': minor
---

# Updated Looker Studio data destination

- Clarify `PUBLIC_ORIGIN`: base public URL of the application (scheme + host [+ optional port]).
  - Examples: `http://localhost:3000`, `https://data-marts.example.com`
  - Default: `http://localhost:${PORT}`
  - In production, set this to your actual deployment URL.
- Introduce `LOOKER_STUDIO_DESTINATION_ORIGIN`: public origin used to generate the deployment URL for the Looker Studio destination.
  - If empty, it falls back to `PUBLIC_ORIGIN`.
  - Example: `https://looker.example.com`

Heads up

- When retrieving the current JSON config for a Looker Studio Data Destination, the `deploymentUrl` field is now generated from `LOOKER_STUDIO_DESTINATION_ORIGIN` (fallback: `PUBLIC_ORIGIN`). If you previously set `deploymentUrl` manually during creation, it is now populated from the environment variable values.

Learn more

- See “Public URLs” section in the deployment guide: <https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#public-urls>
