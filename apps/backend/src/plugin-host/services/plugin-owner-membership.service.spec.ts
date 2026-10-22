import { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import { PluginOwnerMembershipService } from './plugin-owner-membership.service';

const member = (userId: string, isOutbound = false) =>
  new ProjectMemberDto(
    userId,
    `${userId}@localhost`,
    undefined,
    undefined,
    'editor',
    false,
    isOutbound
  );

function setup() {
  const idp = {
    getProjectMembersOrThrow: jest.fn().mockResolvedValue([member('user-1'), member('gone', true)]),
  };
  return { idp, owners: new PluginOwnerMembershipService(idp as never) };
}

describe('PluginOwnerMembershipService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks the IDP once per project for concurrent checks', async () => {
    const { idp, owners } = setup();

    await expect(
      Promise.all([
        owners.activeMember('project-1', 'user-1'),
        owners.activeMember('project-1', 'user-1'),
        owners.activeMember('project-2', 'user-1'),
      ])
    ).resolves.toEqual([member('user-1'), member('user-1'), member('user-1')]);

    expect(idp.getProjectMembersOrThrow.mock.calls).toEqual([['project-1'], ['project-2']]);
  });

  it('asks the IDP again once 30 s have passed', async () => {
    const { idp, owners } = setup();

    await owners.activeMember('project-1', 'user-1');
    jest.advanceTimersByTime(29_999);
    await owners.activeMember('project-1', 'user-1');
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await owners.activeMember('project-1', 'user-1');
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(2);
  });

  it('passes an IDP failure on and asks again on the next check', async () => {
    const { idp, owners } = setup();
    idp.getProjectMembersOrThrow.mockRejectedValueOnce(new Error('IDP is down'));

    await expect(owners.activeMember('project-1', 'user-1')).rejects.toThrow('IDP is down');
    await expect(owners.activeMember('project-1', 'user-1')).resolves.toEqual(member('user-1'));
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(2);
  });

  it('asks the IDP once more before a cached list says no, and answers from that', async () => {
    const { idp, owners } = setup();
    await owners.activeMember('project-1', 'user-1');
    // The owner was added back after the cached list was read.
    idp.getProjectMembersOrThrow.mockResolvedValueOnce([member('user-1'), member('user-2')]);

    await expect(owners.activeMember('project-1', 'user-2')).resolves.toEqual(member('user-2'));
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(2);
  });

  it('takes no for an answer from a list it asked for', async () => {
    const { idp, owners } = setup();

    await expect(owners.activeMember('project-1', 'user-2')).resolves.toBeNull();
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(1);
  });

  it('reads a removed member still listed as outbound as no member', async () => {
    await expect(setup().owners.activeMember('project-1', 'gone')).resolves.toBeNull();
  });

  it('lists the active members for display from the cached list', async () => {
    const { idp, owners } = setup();
    await owners.activeMember('project-1', 'user-1');

    await expect(owners.activeMemberIds('project-1')).resolves.toEqual(new Set(['user-1']));
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledTimes(1);
  });
});
