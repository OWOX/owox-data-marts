import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import { PluginActionSchedule } from './plugin-action-schedule.entity';

const NOW = new Date('2026-10-16T10:00:00.000Z');
const NEXT_SLOT = new Date('2026-10-17T09:00:00.000Z');

function schedule(overrides: Partial<PluginActionSchedule> = {}): PluginActionSchedule {
  return Object.assign(new PluginActionSchedule(), {
    id: 'schedule-1',
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
    status: TriggerStatus.PROCESSING,
    version: 2,
    nextRunTimestamp: new Date('2026-10-16T09:00:00.000Z'),
    lastRunTimestamp: null,
    disabledReason: null,
    ...overrides,
  });
}

describe('PluginActionSchedule', () => {
  describe.each(['onSuccess', 'onError'] as const)('%s', settle => {
    it('takes the next cron slot after now and stays active', () => {
      const active = schedule();

      active[settle](NOW);

      expect(active).toMatchObject({
        lastRunTimestamp: NOW,
        nextRunTimestamp: NEXT_SLOT,
        isActive: true,
        status: TriggerStatus.IDLE,
      });
    });

    it('keeps a paused schedule off', () => {
      const paused = schedule({ isActive: false, nextRunTimestamp: null });

      paused[settle](NOW);

      expect(paused).toMatchObject({
        lastRunTimestamp: NOW,
        nextRunTimestamp: null,
        isActive: false,
        disabledReason: null,
        status: TriggerStatus.IDLE,
      });
    });

    it('keeps a schedule disabled during the run off, with its reason', () => {
      const disabled = schedule();
      disabled.disable(PluginScheduleDisabledReason.ACTION_NOT_DECLARED);

      disabled[settle](NOW);

      expect(disabled).toMatchObject({
        nextRunTimestamp: null,
        isActive: false,
        disabledReason: 'ACTION_NOT_DECLARED',
        status: TriggerStatus.IDLE,
      });
    });

    it('takes retryAt over the cron slot', () => {
      const retryAt = new Date(NOW.getTime() + 60_000);
      const retried = schedule({ retryAt });

      retried[settle](NOW);

      expect(retried).toMatchObject({
        nextRunTimestamp: retryAt,
        isActive: true,
        status: TriggerStatus.IDLE,
      });
    });

    it('takes the cron slot when it comes before retryAt', () => {
      const retried = schedule({ retryAt: new Date(NEXT_SLOT.getTime() + 60_000) });

      retried[settle](NOW);

      expect(retried.nextRunTimestamp).toEqual(NEXT_SLOT);
    });

    it('parks a schedule with no next run, even with a retry', () => {
      const parked = schedule({ parked: true, retryAt: new Date(NOW.getTime() + 60_000) });

      parked[settle](NOW);

      expect(parked).toMatchObject({
        nextRunTimestamp: null,
        isActive: true,
        status: TriggerStatus.IDLE,
      });
    });
  });

  it('disables with a reason and no next run', () => {
    const active = schedule();

    active.disable(PluginScheduleDisabledReason.ACTION_NOT_DECLARED);

    expect(active).toMatchObject({
      isActive: false,
      nextRunTimestamp: null,
      disabledReason: 'ACTION_NOT_DECLARED',
    });
  });

  it('computes the next slot strictly after the given time', () => {
    expect(schedule().nextSlotAfter(NEXT_SLOT)).toEqual(new Date('2026-10-18T09:00:00.000Z'));
  });

  it('computes a slot across a DST gap', () => {
    // 03:00 does not exist in Kyiv on 2027-03-28: 03:00 EET is followed by 04:00 EEST.
    const now = new Date('2027-03-27T12:00:00.000Z');
    const kyiv = schedule({ cronExpression: '0 3 * * *', timeZone: 'Europe/Kyiv' });

    kyiv.onSuccess(now);

    expect(kyiv.nextRunTimestamp).toEqual(new Date('2027-03-28T01:00:00.000Z'));
    expect(kyiv.isActive).toBe(true);
    expect(kyiv.status).toBe(TriggerStatus.IDLE);
    expect(kyiv.nextSlotAfter(new Date('2027-03-28T01:00:00.000Z'))).toEqual(
      new Date('2027-03-29T00:00:00.000Z')
    );
  });

  it('steps from slot to slot across a DST fall-back', () => {
    // 03:30 happens twice in Kyiv on 2026-10-25: 04:00 EEST is followed by 03:00 EET.
    const kyiv = schedule({ cronExpression: '30 3 * * *', timeZone: 'Europe/Kyiv' });
    const slots = [new Date('2026-10-24T12:00:00.000Z')];
    for (let i = 0; i < 3; i += 1) {
      slots.push(kyiv.nextSlotAfter(slots[i]));
    }

    expect(slots.slice(1)).toEqual([
      new Date('2026-10-25T00:30:00.000Z'),
      new Date('2026-10-26T01:30:00.000Z'),
      new Date('2026-10-27T01:30:00.000Z'),
    ]);
    expect(kyiv.nextSlotAfter(new Date('2026-10-25T01:30:00.000Z'))).toEqual(
      new Date('2026-10-26T01:30:00.000Z')
    );
  });

  it.each([
    ['an unknown time zone', '0 9 * * *', 'Mars/Base'],
    ['a field out of range', '61 * * * *', 'UTC'],
    ['a date that never comes', '0 0 30 2 *', 'UTC'],
  ])('refuses %s', (_case, cronExpression, timeZone) => {
    expect(() => schedule({ cronExpression, timeZone }).nextSlotAfter(NOW)).toThrow();
  });
});
