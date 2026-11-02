import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { scheduledDeletion } from './owox-storage-lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-06-30T00:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const days = { notPaidDeletionDays: 30, inactivityDeletionDays: 20 };
const base = { notPaidSince: null, lastActivityAt: null, createdAt: ago(100) };

describe('scheduledDeletion', () => {
  it('dates NOT_PAID from notPaidSince', () => {
    expect(
      scheduledDeletion({ ...base, notPaidSince: ago(5) }, ProjectPlanType.NOT_PAID, days, now)
    ).toEqual({ reason: 'NOT_PAID', date: new Date(ago(5).getTime() + 30 * DAY) });
  });

  it('dates NOT_PAID from now when it is not marked yet', () => {
    expect(scheduledDeletion(base, ProjectPlanType.NOT_PAID, days, now)).toEqual({
      reason: 'NOT_PAID',
      date: new Date(now.getTime() + 30 * DAY),
    });
  });

  it('never deletes PAID', () => {
    expect(scheduledDeletion(base, ProjectPlanType.PAID, days, now)).toBeNull();
  });

  it('restarts the inactivity period for FREE that just left NOT_PAID', () => {
    expect(
      scheduledDeletion({ ...base, notPaidSince: ago(29) }, ProjectPlanType.FREE, days, now)
    ).toEqual({ reason: 'INACTIVE', date: new Date(now.getTime() + 20 * DAY) });
  });

  it('dates FREE from the last activity', () => {
    expect(
      scheduledDeletion({ ...base, lastActivityAt: ago(3) }, ProjectPlanType.FREE, days, now)
    ).toEqual({ reason: 'INACTIVE', date: new Date(ago(3).getTime() + 20 * DAY) });
  });

  it('dates a FREE storage that never ran a job from its creation', () => {
    const result = scheduledDeletion(
      { ...base, createdAt: ago(31) },
      ProjectPlanType.FREE,
      days,
      now
    );
    expect(result?.date.getTime()).toBeLessThanOrEqual(now.getTime() - 11 * DAY);
  });
});
