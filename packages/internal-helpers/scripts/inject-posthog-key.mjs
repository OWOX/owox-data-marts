// Rewrites src/integrations/event-bus/posthog-key.ts with the value of POSTHOG_API_KEY.
// Run by the release pipeline before `npm publish`. The result is NOT committed.
// With no POSTHOG_API_KEY set, writes the empty default (telemetry stays silent).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'integrations', 'event-bus', 'posthog-key.ts');

const key = process.env.POSTHOG_API_KEY ?? '';
if (key && !key.startsWith('phc_')) {
  console.warn(`[inject-posthog-key] warning: POSTHOG_API_KEY does not look like a PostHog key`);
}

const contents = `// AUTO-GENERATED AT RELEASE TIME. Do not commit a non-empty value.
// Injected from the POSTHOG_API_KEY secret by scripts/inject-posthog-key.mjs.
export const BUILT_IN_POSTHOG_API_KEY = ${JSON.stringify(key)};
`;

writeFileSync(target, contents, 'utf8');
console.log(`[inject-posthog-key] wrote key (${key ? 'set' : 'empty'}) to ${target}`);
