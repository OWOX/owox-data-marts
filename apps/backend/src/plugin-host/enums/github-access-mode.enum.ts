/**
 * How a given GitHub read was authenticated, in fallback order.
 *
 * Recorded on the sync report so publishers can tell "the repository is private and
 * the App is not installed" apart from "the repository does not exist". Never shown
 * to ordinary members -- it is source diagnostics.
 */
export enum GithubAccessMode {
  /** Short-lived installation token minted from the OWOX Data Marts GitHub App. */
  APP = 'app',
  /** Deployment-configured GITHUB_TOKEN, self-managed installs. */
  SERVER_TOKEN = 'server-token',
  /** Public repositories need no credential at all. */
  ANONYMOUS = 'anonymous',
}
