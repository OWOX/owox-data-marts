import { Repository } from 'typeorm';
import { ConnectorState } from '../../../entities/connector-state.entity';
import { ConnectorStateService } from './connector-state.service';

describe('ConnectorStateService', () => {
  const createService = (existing: Partial<ConnectorState> | null) => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async entity => entity),
    } as unknown as Repository<ConnectorState>;
    return { service: new ConnectorStateService(repository), repository };
  };

  const savedStates = (repository: Repository<ConnectorState>) =>
    (repository.save as jest.Mock).mock.calls[0][0].state.states;

  it('keeps sibling keys when one message updates a single key', async () => {
    const { service, repository } = createService({
      datamartId: 'dm-1',
      state: {
        at: '2026-09-23T00:00:00.000Z',
        states: [
          { _id: 'cfg-1', state: { date: '2026-09-22', shortLinks: { a: ['b', 1] } }, at: 'x' },
          { _id: 'cfg-2', state: { date: '2026-09-01' }, at: 'y' },
        ],
      },
    } as Partial<ConnectorState>);

    await service.updateState('dm-1', 'cfg-1', { state: { date: '2026-09-23' }, at: 'z' });

    expect(savedStates(repository)).toEqual([
      { _id: 'cfg-1', state: { date: '2026-09-23', shortLinks: { a: ['b', 1] } }, at: 'z' },
      { _id: 'cfg-2', state: { date: '2026-09-01' }, at: 'y' },
    ]);
  });

  it('creates the row and the configuration entry when none exists', async () => {
    const { service, repository } = createService(null);

    await service.updateState('dm-1', 'cfg-1', { state: { shortLinks: {} }, at: 'z' });

    expect(savedStates(repository)).toEqual([{ _id: 'cfg-1', state: { shortLinks: {} }, at: 'z' }]);
  });
});
