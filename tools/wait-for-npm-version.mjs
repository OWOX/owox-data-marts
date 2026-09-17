#!/usr/bin/env node

/**
 * Waits until every given package is resolvable at a specific version on npm.
 *
 * `npm publish` returning successfully does not mean the version can be
 * installed yet: the registry still has to ingest it and the CDN still has to
 * serve a document that mentions it. For a package with a large packument --
 * `@owox/backend` carries well over a thousand snapshot versions -- that has
 * taken upwards of fifteen minutes, long after the sibling packages of the same
 * snapshot were installable. Building the container image before then fails
 * with `ETARGET No matching version found`.
 *
 * Two details matter for the wait to mean anything:
 *
 * - it resolves through the abbreviated packument, the same document
 *   `npm install` reads. The full packument served to `npm view` is a separate
 *   CDN object with its own expiry, so a hit there does not prove the installer
 *   will see the version;
 * - a package that never appears fails the process. Anything less lets the
 *   build run against a version npm cannot resolve.
 *
 * Usage: node tools/wait-for-npm-version.mjs <version> <package...>
 */

const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';
const TIMEOUT_SECONDS = Number(process.env.WAIT_TIMEOUT_SECONDS ?? 1500);
const INTERVAL_SECONDS = Number(process.env.WAIT_INTERVAL_SECONDS ?? 10);

const ABBREVIATED_PACKUMENT = 'application/vnd.npm.install-v1+json';

const [version, ...packages] = process.argv.slice(2);

if (!version || packages.length === 0) {
  console.error('Usage: node tools/wait-for-npm-version.mjs <version> <package...>');
  process.exit(1);
}

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

/**
 * Resolves the version through the document `npm install` reads, so a positive
 * answer here means the installer can see it too.
 *
 * @param {string} name npm package name, scoped or not
 * @param {string} wanted exact version to look for
 * @returns {Promise<boolean>} whether the registry currently serves that version
 */
async function isPublished(name, wanted) {
  try {
    const response = await fetch(`${REGISTRY}/${name.replace('/', '%2F')}`, {
      headers: { accept: ABBREVIATED_PACKUMENT },
    });

    if (!response.ok) return false;

    const packument = await response.json();
    return Boolean(packument.versions?.[wanted]);
  } catch {
    // Network blips are indistinguishable from "not there yet" -- keep waiting.
    return false;
  }
}

/**
 * @param {string} name npm package name to wait for
 * @param {string} wanted exact version to wait for
 * @returns {Promise<void>} resolves once published, rejects on timeout
 */
async function waitFor(name, wanted) {
  const deadline = Date.now() + TIMEOUT_SECONDS * 1000;
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt++) {
    if (await isPublished(name, wanted)) {
      const waited = Math.round((Date.now() - startedAt) / 1000);
      console.log(`✅ ${name}@${wanted} is installable from npm (after ${waited}s)`);
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `${name}@${wanted} did not become installable within ${TIMEOUT_SECONDS}s. ` +
          `It was published, but npm is not serving it yet -- building against it would fail with ETARGET.`
      );
    }

    console.log(`Waiting for ${name}@${wanted} to appear on npm (attempt ${attempt})...`);
    await sleep(INTERVAL_SECONDS);
  }
}

// Sequential on purpose: the packages are published in one batch, so a later
// one is rarely ready before an earlier one, and this keeps the log readable.
try {
  for (const name of packages) {
    await waitFor(name, version);
  }
} catch (error) {
  // A stack trace here would only bury the one line that explains the failure.
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
}

console.log(`\nAll ${packages.length} packages are installable at ${version}.`);
