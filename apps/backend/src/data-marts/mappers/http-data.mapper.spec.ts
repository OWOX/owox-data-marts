import { AuthorizationContext } from '../../idp/types/auth.types';
import { HttpDataMapper } from './http-data.mapper';

describe('HttpDataMapper', () => {
  const mapper = new HttpDataMapper();

  it('builds a StreamHttpDataCommand from path param + auth context + raw query', () => {
    const ctx: AuthorizationContext = {
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    };

    const command = mapper.toStreamHttpDataCommand('dm-1', ctx, {
      column: ['date', 'Revenue Total'],
    });

    expect(command).toEqual({
      dataMartId: 'dm-1',
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      rawQuery: { column: ['date', 'Revenue Total'] },
    });
  });

  it('defaults roles to empty array when context has no roles', () => {
    const ctx: AuthorizationContext = {
      userId: 'user-2',
      projectId: 'project-2',
    };

    const command = mapper.toStreamHttpDataCommand('dm-2', ctx, {});

    expect(command.roles).toEqual([]);
  });
});
