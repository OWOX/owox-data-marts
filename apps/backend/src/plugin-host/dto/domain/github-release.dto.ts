export interface GithubReleaseDto {
  readonly githubReleaseId: string;
  readonly tagName: string;
  readonly isDraft: boolean;
  /** GitHub's prerelease checkbox, distinct from a prerelease identifier in the tag. */
  readonly isPrerelease: boolean;
  readonly publishedAt: Date | null;
}
