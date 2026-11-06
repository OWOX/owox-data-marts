interface ParsedVersion {
  core: [number, number, number];
  prerelease: string | null;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(version: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    // The prerelease group is optional, so it may be missing from the match.
    prerelease: match.at(4) ?? null,
  };
}

/**
 * Orders two versions the way semver does: `0.42.0-next-20261105` comes before `0.42.0` and
 * after `0.41.0`. Returns a negative number, zero or a positive number, or `null` when either
 * value is not a version.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    const difference = left.core[i] - right.core[i];
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return Math.sign(left.prerelease.localeCompare(right.prerelease, 'en', { numeric: true }));
}
