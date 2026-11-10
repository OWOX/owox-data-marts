interface ParsedVersion {
  core: [number, number, number];
  /** Dot-separated prerelease identifiers; empty for a release. */
  prerelease: string[];
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const NUMERIC_IDENTIFIER = /^\d+$/;

function parseVersion(version: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    // The prerelease group is optional, so it may be missing from the match.
    prerelease: match.at(4)?.split('.') ?? [],
  };
}

/** Semver identifier precedence: numbers by value and before any text, text in ASCII order. */
function compareIdentifiers(a: string, b: string): number {
  const aIsNumber = NUMERIC_IDENTIFIER.test(a);
  const bIsNumber = NUMERIC_IDENTIFIER.test(b);
  if (aIsNumber && bIsNumber) return Math.sign(Number(a) - Number(b));
  if (aIsNumber) return -1;
  if (bIsNumber) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Orders two versions by semver precedence: `0.42.0-next-20261105` comes before `0.42.0` and
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

  // A release ranks above any prerelease of the same version.
  if (!left.prerelease.length || !right.prerelease.length) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    if (i === left.prerelease.length) return -1;
    if (i === right.prerelease.length) return 1;
    const difference = compareIdentifiers(left.prerelease[i], right.prerelease[i]);
    if (difference !== 0) return difference;
  }
  return 0;
}
