export interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export type ReleaseTagRejectionReason = 'not-semver' | 'prerelease' | 'build-metadata';

export type ReleaseTagParseResult =
  | { readonly ok: true; readonly parts: SemverParts }
  | { readonly ok: false; readonly reason: ReleaseTagRejectionReason };

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/**
 * Parses a GitHub Release tag into an activatable version.
 *
 * Prerelease identifiers and build metadata are valid SemVer 2.0.0 and are refused
 * anyway (decision D6): the Gallery activates the highest version automatically and
 * members cannot pin one, so a release candidate reaching production is a hazard
 * rather than a feature. Build metadata is worse still -- SemVer requires it to be
 * ignored for precedence, so `1.2.3` and `1.2.3+build` would tie under a unique
 * index on (pluginId, semver).
 *
 * They are reported separately from `not-semver` so the publisher gets an actionable
 * message instead of hunting for a typo in a textbook-correct tag.
 */
export function parseReleaseTag(tagName: string): ReleaseTagParseResult {
  const trimmed = tagName?.trim() ?? '';
  const withoutPrefix = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;

  const match = SEMVER.exec(withoutPrefix);
  if (!match) {
    return { ok: false, reason: 'not-semver' };
  }

  if (match[4] !== undefined) {
    return { ok: false, reason: 'prerelease' };
  }

  if (match[5] !== undefined) {
    return { ok: false, reason: 'build-metadata' };
  }

  return {
    ok: true,
    parts: { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) },
  };
}

/** Canonical stored form: no `v` prefix. */
export function formatSemver(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

/** Major component of a canonical `X.Y.Z` string. */
export function majorOf(semver: string): number {
  return Number(semver.split('.')[0]);
}

/**
 * True when two canonical versions sit in the same compatibility line: the range a
 * release cannot break out of without declaring it.
 *
 * From 1.0.0 on, the line is the major version. Below 1.0.0 SemVer makes no stability
 * promise at all (§4), so the line narrows to the minor: a 0.y plugin declares a
 * breaking change by bumping the minor version, without being forced out of 0.x.
 */
export function sameCompatibilityLine(a: string, b: string): boolean {
  const [aMajor, aMinor] = a.split('.');
  const [bMajor, bMinor] = b.split('.');

  if (aMajor !== bMajor) {
    return false;
  }

  return aMajor !== '0' || aMinor === bMinor;
}

/**
 * Field-by-field numeric comparison. Usable directly as an Array#sort comparator.
 *
 * Inputs are always canonical `X.Y.Z` -- prerelease and build metadata never reach
 * storage -- so this needs none of the SemVer precedence rules for identifiers.
 */
export function compareSemver(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');

  for (let i = 0; i < 3; i++) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}
