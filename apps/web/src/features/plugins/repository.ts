/**
 * `owner/name`, which is how a publisher refers to the repository everywhere else --
 * in the publish form, in owox-ctl, and on GitHub itself.
 */
export function repositoryPath(repositoryUrl: string): string {
  try {
    return new URL(repositoryUrl).pathname.replace(/^\//, '');
  } catch {
    return repositoryUrl;
  }
}
