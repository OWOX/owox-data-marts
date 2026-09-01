import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InstalledPlugin,
  PluginGalleryEntry,
  PluginPublication,
} from '../../../features/plugins';
import { describeVisibility as actualDescribeVisibility } from '../../../features/plugins/visibility';
import { repositoryPath as actualRepositoryPath } from '../../../features/plugins/repository';
import { safeHttpsUrl as actualSafeHttpsUrl } from '../../../features/plugins/safeHttpsUrl';
import { findReleaseIssues as actualFindReleaseIssues } from '../../../features/plugins/rejections';
import { PluginReleaseIssuesCard as ActualPluginReleaseIssuesCard } from '../../../features/plugins/components/PluginReleaseIssuesCard';

const publish = vi.fn();
const unpublish = vi.fn();
let publishableScopes: string[] = ['member'];
const uninstall = vi.fn();
const checkNow = vi.fn();
const navigate = vi.fn();

let publications: PluginPublication[] = [];
let installations: InstalledPlugin[] = [];
let plugin: PluginGalleryEntry;

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useParams: () => ({ pluginId: 'p1' }), useNavigate: () => navigate };
});
vi.mock('../../../features/plugins', () => ({
  usePlugin: () => ({ plugin, isLoading: false }),
  usePluginActions: () => ({
    install: vi.fn(),
    uninstall,
    checkNow,
    isInstalling: false,
    isUpdating: false,
  }),
  usePluginInstallations: () => ({ installations, isLoading: false }),
  usePluginManageablePublications: () => publications,
  usePluginPublishing: () => ({ publish, unpublish, isPublishing: false, isUnpublishing: false }),
  usePublishableScopes: () => publishableScopes,
  describeVisibility: actualDescribeVisibility,
  repositoryPath: actualRepositoryPath,
  safeHttpsUrl: actualSafeHttpsUrl,
  findReleaseIssues: actualFindReleaseIssues,
  PluginReleaseIssuesCard: ActualPluginReleaseIssuesCard,
  AudienceIcon: () => null,
  InstallPluginDialog: () => null,
}));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
vi.mock('../../../features/idp', () => ({
  useAuth: () => ({ user: { id: 'u1', fullName: 'A Member' } }),
}));

import PluginDetailsPage from './PluginDetailsPage';
import { versionHint } from './versionHint';

const entry = (over: Partial<PluginGalleryEntry> = {}): PluginGalleryEntry => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  description: 'Does something',
  currentSemver: '1.0.0',
  currentVersionId: 'v1',
  visibleViaScopes: ['member'],
  suspended: false,
  installationState: 'not_installed',
  source: {
    ownerName: 'owox',
    ownerUrl: 'https://github.com/owox',
    repositoryUrl: 'https://github.com/owox/example',
  },
  addedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const publication = (over: Partial<PluginPublication> = {}): PluginPublication => ({
  publicationId: 'pub-1',
  pluginId: 'p1',
  repository: 'owox/example-plugin',
  scope: 'member',
  isActive: true,
  allProjects: false,
  audienceProjectIds: [],
  currentSemver: '1.0.0',
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PluginDetailsPage />
    </MemoryRouter>
  );

const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: 'More plugin actions' }), { key: 'Enter' });

describe('PluginDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publications = [];
    installations = [];
    publishableScopes = ['member'];
    publish.mockResolvedValue(null);
    unpublish.mockResolvedValue(undefined);
    plugin = entry();
  });

  // Header owns install/reinstall; the version chip carries Check now regardless.
  it('offers Install or Reinstall in the header, and updating once installed', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    cleanup();

    // Soft-uninstalled: same Install label + confirm path as a first install.
    plugin = entry({ installationState: 'uninstalled' });
    renderPage();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reinstall' })).toBeNull();
    cleanup();

    plugin = entry({ installationState: 'installed' });
    renderPage();

    expect(screen.getByRole('button', { name: 'Reinstall' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(checkNow).toHaveBeenCalledWith('p1');
  });

  it('offers Credential configuration instead of reinstall for an installed plugin requirement', () => {
    plugin = entry({ installationState: 'installed', credentialRequirements: ['github'] });

    renderPage();

    expect(screen.getByRole('button', { name: 'Configure Credentials' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reinstall' })).toBeNull();
  });

  // §6.3: Check now is open to any project member who can reach the page, not only one
  // who has installed the plugin -- an installation requirement would only delay a check
  // that is scheduled and inevitable anyway.
  it('offers Check now even without an installation', () => {
    plugin = entry({ installationState: 'not_installed' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(checkNow).toHaveBeenCalledWith('p1');
  });

  // The member never chose this version and cannot pin it, so the Version tooltip has to
  // say maintenance is automatic and shared, and when the next check falls.
  it('builds the version hint with the daily cadence, the next check and who it reaches', () => {
    const hint = versionHint('2026-08-04T03:15:00.000Z');

    expect(hint).toContain('Updates are checked daily');
    expect(hint).toContain('Next check:');
    expect(hint).toContain('applied automatically to everyone using this plugin');
  });

  // A plugin nothing publishes and nobody has installed carries no next check. The hint has
  // to survive that rather than render "Next check: —".
  it('drops only the next-check clause when the plugin is off daily maintenance', () => {
    const hint = versionHint(null);

    expect(hint).not.toContain('Next check:');
    expect(hint).toContain('applied automatically to everyone using this plugin');
  });

  it('reports who installed it and when', () => {
    plugin = entry({ installationState: 'installed' });
    installations = [
      {
        ...plugin,
        installationId: 'i1',
        installedAt: '2026-07-01T00:00:00.000Z',
        uninstalledAt: null,
      },
    ];
    renderPage();

    expect(screen.getByText('A Member')).toBeTruthy();
  });

  /**
   * §16: the owner is always disclosed; the repository only when it is public. Naming a
   * private repository would confirm that one specific private repository exists.
   */
  it('withholds the repository of a private source', () => {
    plugin = entry({ source: { ownerName: 'owox', ownerUrl: 'https://github.com/owox' } });
    renderPage();

    expect(screen.getByText('owox')).toBeTruthy();
    expect(screen.queryByText('owox/example')).toBeNull();
    expect(screen.getByText('Private repository')).toBeTruthy();
  });

  // The publisher refers to it as owner/name everywhere else, so the page does too.
  it('names a public repository as owner/name and links to it', () => {
    renderPage();

    expect(screen.getByText('owox/example')).toBeTruthy();
    expect(screen.getByRole('link', { name: /owox\/example/ })).toHaveAttribute(
      'href',
      'https://github.com/owox/example'
    );
  });

  /**
   * A long owner/name has to truncate to keep the three Source cards the same width, so
   * the full path must stay reachable some other way.
   */
  it('keeps a long repository path readable when it truncates', () => {
    const repositoryUrl = 'https://github.com/romandubovyi/owox-plugin-example-with-a-long-name';
    plugin = entry({
      source: {
        ownerName: 'romandubovyi',
        ownerUrl: 'https://github.com/romandubovyi',
        repositoryUrl,
      },
    });
    renderPage();

    const path = 'romandubovyi/owox-plugin-example-with-a-long-name';
    expect(screen.getByText(path).className).toContain('truncate');
    expect(screen.getByRole('link', { name: new RegExp(path) })).toHaveAttribute(
      'href',
      repositoryUrl
    );
  });

  it('offers nothing to withdraw when the caller manages no publication', () => {
    renderPage();
    openMenu();

    expect(screen.queryByRole('menuitem', { name: /^Unpublish/ })).toBeNull();
  });

  // The levels are independent, so a plugin listed both personally and project-wide has
  // to be withdrawable from either one without touching the other.
  it('offers one withdrawal per manageable publication, addressed by repository', () => {
    publications = [
      publication({ publicationId: 'pub-1', scope: 'member' }),
      publication({ publicationId: 'pub-2', scope: 'project' }),
    ];
    renderPage();
    openMenu();

    // Asserted before clicking: the menu closes on selection, taking its items with it.
    expect(screen.getByRole('menuitem', { name: 'Unpublish for me' })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpublish from project' }));

    expect(unpublish).toHaveBeenCalledTimes(1);
    expect(unpublish).toHaveBeenCalledWith('owox/example-plugin', 'project');
  });

  /**
   * §11 has no "move" between levels: publishing at another one only adds visibility.
   * Sharing is therefore publish-then-withdraw, and both halves have to happen.
   */
  it('shares a personal listing with the project, then withdraws the personal one', async () => {
    publishableScopes = ['project', 'member'];
    publications = [publication({ scope: 'member' })];
    renderPage();
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Share with the project' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('owox/example-plugin', 'project');
    });
    await waitFor(() => {
      expect(unpublish).toHaveBeenCalledWith('owox/example-plugin', 'member');
    });
  });

  // Only a Project Admin may publish at project scope, so nobody else is offered it.
  it('offers sharing only to someone who may publish to the project', () => {
    publications = [publication({ scope: 'member' })];
    renderPage();
    openMenu();

    expect(screen.queryByRole('menuitem', { name: 'Share with the project' })).toBeNull();
  });

  // A failed publish must not withdraw the listing the member still has.
  it('keeps the personal listing when sharing fails', async () => {
    publishableScopes = ['project', 'member'];
    publications = [publication({ scope: 'member' })];
    publish.mockResolvedValue({ message: 'Nope' });
    renderPage();
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Share with the project' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalled();
    });
    expect(unpublish).not.toHaveBeenCalled();
  });

  it('says plainly that withdrawing a listing uninstalls nobody', () => {
    publications = [publication()];
    renderPage();

    expect(screen.getByText(/Nobody is uninstalled/)).toBeTruthy();
  });

  // Only an installer may uninstall, so it must not be offered to anyone else.
  it('offers uninstall only to a member who has it installed', () => {
    renderPage();
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Uninstall' })).toBeNull();

    plugin = entry({ installationState: 'installed' });
    renderPage();
    openMenu();

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Uninstall' })[0]);
    expect(uninstall).toHaveBeenCalledWith('p1');
  });

  it('marks a suspended plugin and refuses to install it', () => {
    plugin = entry({ suspended: true });
    renderPage();

    expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  const diagnostics = (
    rejections: NonNullable<PluginPublication['diagnostics']>['rejections']
  ): NonNullable<PluginPublication['diagnostics']> => ({
    deliveryUrl: 'https://plugin.example.com',
    commitSha: 'abc',
    accessMode: 'app',
    syncedAt: '2026-08-17T13:00:12.933Z',
    acceptedSemvers: [],
    unchangedSemvers: [],
    rejections,
  });

  // The reported gap: a rejected release used to look exactly like "Check now did
  // nothing", with the reason stored in the database and shown nowhere.
  it('tells a publisher why a release was rejected', () => {
    publications = [
      publication({
        diagnostics: diagnostics([
          {
            tagName: 'v1.0.2',
            githubReleaseId: 'r2',
            code: 'COLLECTIONS_INCOMPATIBLE',
            detail: 'Collection "dashboards" cannot change entity binding',
          },
        ]),
      }),
    ];
    renderPage();

    expect(screen.getByText('Release issues')).toBeTruthy();
    expect(screen.getByText('v1.0.2')).toBeTruthy();
    expect(screen.getByText('COLLECTIONS_INCOMPATIBLE')).toBeTruthy();
    expect(screen.getByText('Collection "dashboards" cannot change entity binding')).toBeTruthy();
  });

  // Drafts and prereleases are out by design; repeating them here would bury the one
  // entry a publisher needs. And with no diagnostics at all -- a non-publisher -- the
  // card must not exist.
  it('shows no release issues for by-design rejections or without diagnostics', () => {
    publications = [
      publication({
        diagnostics: diagnostics([
          { tagName: 'v2.0.0-rc.1', githubReleaseId: 'r3', code: 'PRERELEASE_TAG', detail: '…' },
        ]),
      }),
    ];
    renderPage();
    expect(screen.queryByText('Release issues')).toBeNull();
    cleanup();

    publications = [publication()];
    renderPage();
    expect(screen.queryByText('Release issues')).toBeNull();
  });
});
