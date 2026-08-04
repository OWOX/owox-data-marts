import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginInstallationService } from './plugin-installation.service';

const WINNER = { id: 'i-winner', pluginId: 'p1' } as PluginInstallation;

const duplicate = () =>
  new QueryFailedError('INSERT', [], {
    message: 'UNIQUE constraint failed: plugin_installation.pluginId',
  } as unknown as Error);

function setup() {
  const repository = {
    create: jest.fn((input: unknown) => input),
    save: jest.fn(),
    findOneBy: jest.fn(),
  } as unknown as jest.Mocked<Repository<PluginInstallation>>;

  return { service: new PluginInstallationService(repository), repository };
}

/**
 * UQ_plugin_installation is what makes a double-click safe for the data; these tests are
 * about making it safe for the member, who asked to install and is installed either way.
 */
describe('PluginInstallationService.installOrFind', () => {
  it('reports the row it wrote when it wins', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockResolvedValue(WINNER);

    await expect(s.service.installOrFind('p1', 'j1', 'u1')).resolves.toEqual({
      installation: WINNER,
      wonRace: true,
    });
    expect(s.repository.findOneBy).not.toHaveBeenCalled();
  });

  it('re-reads the winner’s row instead of surfacing the conflict', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(duplicate());
    (s.repository.findOneBy as jest.Mock).mockResolvedValue(WINNER);

    await expect(s.service.installOrFind('p1', 'j1', 'u1')).resolves.toEqual({
      installation: WINNER,
      wonRace: false,
    });
    expect(s.repository.findOneBy).toHaveBeenCalledWith({
      pluginId: 'p1',
      projectId: 'j1',
      userId: 'u1',
    });
  });

  // Swallowing a conflict that leaves nothing behind would report success for a row that
  // does not exist -- worse than the 500 this replaces.
  it('rethrows when the conflict left no row to read', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(duplicate());
    (s.repository.findOneBy as jest.Mock).mockResolvedValue(null);

    await expect(s.service.installOrFind('p1', 'j1', 'u1')).rejects.toBeInstanceOf(
      QueryFailedError
    );
  });

  it('rethrows an error that is not a unique violation', async () => {
    const s = setup();
    (s.repository.save as jest.Mock).mockRejectedValue(new Error('connection lost'));

    await expect(s.service.installOrFind('p1', 'j1', 'u1')).rejects.toThrow('connection lost');
    expect(s.repository.findOneBy).not.toHaveBeenCalled();
  });
});
