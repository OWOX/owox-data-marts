/**
 * Why a single GitHub Release was not turned into a PluginVersion.
 *
 * These are not exceptions: one ineligible Release must never abort a sync that
 * also contains good ones, so they are collected into the plugin's sync report.
 * The report is publisher-facing only -- members never see rejection detail.
 */
export enum ReleaseRejectionCode {
  DRAFT = 'DRAFT',
  /** GitHub's `prerelease` boolean is set on the Release. */
  PRERELEASE_FLAG = 'PRERELEASE_FLAG',
  /** Tag carries a prerelease identifier, e.g. `v1.2.3-rc.1`. Valid SemVer, refused by design. */
  PRERELEASE_TAG = 'PRERELEASE_TAG',
  /** Tag carries build metadata, e.g. `v1.2.3+build.7`. Valid SemVer, refused by design. */
  BUILD_METADATA_TAG = 'BUILD_METADATA_TAG',
  /** Tag is not strict SemVer at all. */
  INVALID_TAG = 'INVALID_TAG',
  COMMIT_UNRESOLVABLE = 'COMMIT_UNRESOLVABLE',
  MANIFEST_MISSING = 'MANIFEST_MISSING',
  MANIFEST_INVALID_JSON = 'MANIFEST_INVALID_JSON',
  MANIFEST_SCHEMA = 'MANIFEST_SCHEMA',
  /**
   * A minor or patch release removes, rescopes or rebinds a collection that an earlier
   * release declared. The released structure is a contract within a major line; a major
   * version bump is how a publisher ships such a change deliberately.
   */
  COLLECTIONS_INCOMPATIBLE = 'COLLECTIONS_INCOMPATIBLE',
  DELIVERY_UNSUPPORTED = 'DELIVERY_UNSUPPORTED',
  URL_NOT_HTTPS = 'URL_NOT_HTTPS',
  URL_PRIVATE_NETWORK = 'URL_PRIVATE_NETWORK',
  URL_UNREACHABLE = 'URL_UNREACHABLE',
  IFRAME_BLOCKED = 'IFRAME_BLOCKED',
  /** This SemVer is already recorded against a different Release or commit. */
  VERSION_CONFLICT = 'VERSION_CONFLICT',
}

/**
 * Whether each rejection marks something the publisher can and should act on: a release
 * that wanted to become current and could not.
 *
 * `false` marks the candidacy codes -- releases that are ineligible by design and
 * permanently. A repository full of drafts and release candidates would repeat them on
 * every daily check while nothing is actually wrong, burying the one line that matters.
 *
 * `satisfies` over the full enum so that adding a code without deciding its visibility
 * is a compile error, not a silent disappearance from the log and audit trail.
 */
const REJECTION_IS_PUBLISHER_ACTIONABLE = {
  [ReleaseRejectionCode.DRAFT]: false,
  [ReleaseRejectionCode.PRERELEASE_FLAG]: false,
  [ReleaseRejectionCode.PRERELEASE_TAG]: false,
  [ReleaseRejectionCode.BUILD_METADATA_TAG]: false,
  [ReleaseRejectionCode.INVALID_TAG]: false,
  [ReleaseRejectionCode.COMMIT_UNRESOLVABLE]: true,
  [ReleaseRejectionCode.MANIFEST_MISSING]: true,
  [ReleaseRejectionCode.MANIFEST_INVALID_JSON]: true,
  [ReleaseRejectionCode.MANIFEST_SCHEMA]: true,
  [ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE]: true,
  [ReleaseRejectionCode.DELIVERY_UNSUPPORTED]: true,
  [ReleaseRejectionCode.URL_NOT_HTTPS]: true,
  [ReleaseRejectionCode.URL_PRIVATE_NETWORK]: true,
  [ReleaseRejectionCode.URL_UNREACHABLE]: true,
  [ReleaseRejectionCode.IFRAME_BLOCKED]: true,
  [ReleaseRejectionCode.VERSION_CONFLICT]: true,
} satisfies Record<ReleaseRejectionCode, boolean>;

export const PUBLISHER_ACTIONABLE_REJECTION_CODES: ReadonlySet<ReleaseRejectionCode> = new Set(
  (Object.keys(REJECTION_IS_PUBLISHER_ACTIONABLE) as ReleaseRejectionCode[]).filter(
    code => REJECTION_IS_PUBLISHER_ACTIONABLE[code]
  )
);
