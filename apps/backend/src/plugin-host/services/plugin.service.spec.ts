import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { Plugin } from '../entities/plugin.entity';
import { PluginService } from './plugin.service';

const REPO = {
  githubRepoId: '987654321',
  owner: 'OWOX',
  name: 'example-plugin',
  isPrivate: false,
  htmlUrl: 'https://github.com/OWOX/example-plugin',
  accessMode: GithubAccessMode.ANONYMOUS,
};

const WINNER = { id: 'p-winner', githubRepoId: REPO.githubRepoId } as Plugin;

const duplicate = () =>
  new QueryFailedError('INSERT', [], {
    message: 'UNIQUE constraint failed: plugin.githubRepoId',
  } as unknown as Error);

function setup() {
  const repository = {
    create: jest.fn((input: unknown) => input),
    save: jest.fn(),
    findOneBy: jest.fn(),
  } as unknown as jest.Mocked<Repository<Plugin>>;

  return { service: new PluginService(repository), repository };
}

/**
 * Identity is the numeric repository id, so two concurrent first publishes of the same
 * repository are asking for the same row -- the winner's answer is the right one for both.
 */
describe('PluginService.createOrFindForRepo', () => {
  it('returns the row it wrote when it wins', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockResolvedValue(WINNER);

    await expect(s.service.createOrFindForRepo(REPO)).resolves.toBe(WINNER);
    expect(s.repository.findOneBy).not.toHaveBeenCalled();
  });

  it('re-reads by repository id instead of failing the publish', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(duplicate());
    (s.repository.findOneBy as jest.Mock).mockResolvedValue(WINNER);

    await expect(s.service.createOrFindForRepo(REPO)).resolves.toBe(WINNER);
    expect(s.repository.findOneBy).toHaveBeenCalledWith({ githubRepoId: REPO.githubRepoId });
  });

  it('rethrows when the conflict left no row to read', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(duplicate());
    (s.repository.findOneBy as jest.Mock).mockResolvedValue(null);

    await expect(s.service.createOrFindForRepo(REPO)).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('rethrows an error that is not a unique violation', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(new Error('connection lost'));

    await expect(s.service.createOrFindForRepo(REPO)).rejects.toThrow('connection lost');
    expect(s.repository.findOneBy).not.toHaveBeenCalled();
  });
});

describe('PluginService sync lease', () => {
  let dataSource: DataSource;
  let repository: Repository<Plugin>;
  let service: PluginService;
  let plugin: Plugin;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Plugin],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository(Plugin);
    service = new PluginService(repository);
    plugin = await repository.save(
      repository.create({
        githubRepoId: 'lease-test',
        repoOwner: 'OWOX',
        repoName: 'lease-test',
        repoHtmlUrl: 'https://github.com/OWOX/lease-test',
      })
    );
  });

  afterEach(async () => dataSource.destroy());

  it('atomically grants only one concurrent claimant', async () => {
    const claims = await Promise.all([
      service.tryClaimSyncSlot(plugin.id, 0),
      service.tryClaimSyncSlot(plugin.id, 0),
    ]);

    expect(claims.filter(claim => claim.status === 'claimed')).toHaveLength(1);
    expect(claims.filter(claim => claim.status === 'in_progress')).toHaveLength(1);
  });

  it('allows only the owner to release and allows a new claim after release', async () => {
    const claim = await service.tryClaimSyncSlot(plugin.id, 0);
    expect(claim).toMatchObject({ status: 'claimed', leaseId: expect.any(String) });
    if (claim.status !== 'claimed') throw new Error('Expected a claimed sync slot');

    await service.releaseSyncSlot(plugin.id, 'different-owner');
    await expect(service.tryClaimSyncSlot(plugin.id, 0)).resolves.toMatchObject({
      status: 'in_progress',
    });

    await service.releaseSyncSlot(plugin.id, claim.leaseId);
    await expect(service.tryClaimSyncSlot(plugin.id, 0)).resolves.toMatchObject({
      status: 'claimed',
      leaseId: expect.any(String),
    });
  });

  it('reclaims a stale lease with a different owner token', async () => {
    const oldClaim = await service.tryClaimSyncSlot(plugin.id, 0);
    if (oldClaim.status !== 'claimed') throw new Error('Expected a claimed sync slot');
    await repository.update(plugin.id, {
      syncLeaseStartedAt: new Date(Date.now() - 31 * 60 * 1000),
      lastSyncAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    const replacement = await service.tryClaimSyncSlot(plugin.id, 0);
    expect(replacement).toMatchObject({ status: 'claimed', leaseId: expect.any(String) });
    if (replacement.status !== 'claimed') throw new Error('Expected a replacement sync slot');
    expect(replacement.leaseId).not.toBe(oldClaim.leaseId);

    await service.releaseSyncSlot(plugin.id, oldClaim.leaseId);
    await expect(repository.findOneByOrFail({ id: plugin.id })).resolves.toMatchObject({
      syncLeaseId: replacement.leaseId,
    });
  });

  it('returns the remaining cooldown separately from an active lease', async () => {
    await repository.update(plugin.id, {
      lastSyncAt: new Date(Date.now() - 60_000),
      syncLeaseId: null,
      syncLeaseStartedAt: null,
    });

    await expect(service.tryClaimSyncSlot(plugin.id, 300_000)).resolves.toMatchObject({
      status: 'rate_limited',
      retryAfterSeconds: 240,
      state: { pluginId: plugin.id },
    });
  });
});
