import { GithubAccessMode } from '../../enums/github-access-mode.enum';

export interface GithubRepoDto {
  /**
   * GitHub's numeric repository id as a decimal string.
   *
   * The identity anchor. Two repository URLs are the same plugin only when GitHub
   * resolves them to this same value -- identical contents, manifests or delivery
   * URLs never establish identity.
   */
  readonly githubRepoId: string;
  /** Current owner and name. Mutable metadata, refreshed on each sync. */
  readonly owner: string;
  readonly name: string;
  readonly isPrivate: boolean;
  readonly htmlUrl: string;
  /** How this read was authenticated. Publisher diagnostics only. */
  readonly accessMode: GithubAccessMode;
}
