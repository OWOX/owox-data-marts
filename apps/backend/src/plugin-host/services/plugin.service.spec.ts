import { QueryFailedError, Repository } from 'typeorm';
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
