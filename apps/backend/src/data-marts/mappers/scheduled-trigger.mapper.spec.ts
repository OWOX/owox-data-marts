import { ScheduledTriggerMapper } from './scheduled-trigger.mapper';

describe('ScheduledTriggerMapper actor propagation', () => {
  it('preserves HTTP actor identity and roles when mapping read admission', () => {
    const mapper = new ScheduledTriggerMapper();
    const actor = { projectId: 'project', userId: 'user', roles: ['viewer'] as const };
    const context = { ...actor, roles: [...actor.roles] };
    expect(mapper.toGetCommand('trigger', 'dm', context)).toMatchObject({
      id: 'trigger',
      dataMartId: 'dm',
      projectId: 'project',
      userId: 'user',
      roles: ['viewer'],
    });
    expect(mapper.toListCommand('dm', context)).toMatchObject({
      dataMartId: 'dm',
      projectId: 'project',
      userId: 'user',
      roles: ['viewer'],
    });
  });
});
