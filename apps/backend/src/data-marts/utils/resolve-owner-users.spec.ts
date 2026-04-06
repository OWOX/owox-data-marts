import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { resolveOwnerUsers } from './resolve-owner-users';

describe('resolveOwnerUsers', () => {
  it('should return empty array for empty ownerIds', () => {
    const projections = new UserProjectionsListDto([]);
    expect(resolveOwnerUsers([], projections)).toEqual([]);
  });

  it('should return empty array for null ownerIds', () => {
    const projections = new UserProjectionsListDto([]);
    expect(resolveOwnerUsers(null as never, projections)).toEqual([]);
  });

  it('should return empty array for undefined ownerIds', () => {
    const projections = new UserProjectionsListDto([]);
    expect(resolveOwnerUsers(undefined as never, projections)).toEqual([]);
  });

  it('should map known users to their UserProjectionDto', () => {
    const alice = new UserProjectionDto('user-1', 'Alice', 'alice@test.com', 'avatar-1');
    const bob = new UserProjectionDto('user-2', 'Bob', 'bob@test.com', null);
    const projections = new UserProjectionsListDto([alice, bob]);

    const result = resolveOwnerUsers(['user-1', 'user-2'], projections);

    expect(result).toEqual([alice, bob]);
  });

  it('should create placeholder UserProjectionDto for unknown users', () => {
    const projections = new UserProjectionsListDto([]);

    const result = resolveOwnerUsers(['ghost-user'], projections);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('ghost-user');
    expect(result[0].fullName).toBeNull();
    expect(result[0].email).toBeNull();
    expect(result[0].avatar).toBeNull();
  });

  it('should mix known and unknown users preserving order', () => {
    const alice = new UserProjectionDto('user-1', 'Alice', 'alice@test.com', null);
    const projections = new UserProjectionsListDto([alice]);

    const result = resolveOwnerUsers(['ghost-user', 'user-1', 'another-ghost'], projections);

    expect(result).toHaveLength(3);
    expect(result[0].userId).toBe('ghost-user');
    expect(result[0].fullName).toBeNull();
    expect(result[1]).toBe(alice);
    expect(result[2].userId).toBe('another-ghost');
    expect(result[2].fullName).toBeNull();
  });

  it('should return duplicate entries when ownerIds contains duplicates', () => {
    const alice = new UserProjectionDto('user-1', 'Alice', 'alice@test.com', null);
    const projections = new UserProjectionsListDto([alice]);

    const result = resolveOwnerUsers(['user-1', 'user-1'], projections);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(alice);
    expect(result[1]).toBe(alice);
  });
});
