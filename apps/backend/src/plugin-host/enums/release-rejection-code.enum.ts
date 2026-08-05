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
  COLLECTIONS_INCOMPATIBLE = 'COLLECTIONS_INCOMPATIBLE',
  DELIVERY_UNSUPPORTED = 'DELIVERY_UNSUPPORTED',
  URL_NOT_HTTPS = 'URL_NOT_HTTPS',
  URL_PRIVATE_NETWORK = 'URL_PRIVATE_NETWORK',
  URL_UNREACHABLE = 'URL_UNREACHABLE',
  IFRAME_BLOCKED = 'IFRAME_BLOCKED',
  /** This SemVer is already recorded against a different Release or commit. */
  VERSION_CONFLICT = 'VERSION_CONFLICT',
}
