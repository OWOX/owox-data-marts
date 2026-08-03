import { Repository } from 'typeorm';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginPublication } from '../entities/plugin-publication.entity';
import { Plugin } from '../entities/plugin.entity';
import { PluginUpdateScheduleService } from './plugin-update-schedule.service';

function setup(counts: { publications?: number; installations?: number } = {}) {
  const update = jest.fn().mockReturnThis();
  const builder = {
    update,
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const plugins = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<Plugin>>;

  const publications = {
    countBy: jest.fn().mockResolvedValue(counts.publications ?? 0),
  } as unknown as jest.Mocked<Repository<PluginPublication>>;

  const installations = {
    countBy: jest.fn().mockResolvedValue(counts.installations ?? 0),
  } as unknown as jest.Mocked<Repository<PluginInstallation>>;

  return {
    service: new PluginUpdateScheduleService(plugins, publications, installations),
    plugins,
    publications,
    installations,
    builder,
  };
}

describe('PluginUpdateScheduleService', () => {
  describe('the daily slot', () => {
    const { service } = setup();
    const now = new Date('2026-08-03T12:00:00.000Z');

    // Stable across restarts is the whole requirement: a slot redrawn on every boot
    // would let a restarting deployment check the same plugin several times a day.
    it('gives one plugin the same slot every time it is asked', () => {
      expect(service.nextSlotAfter('p1', now).toISOString()).toBe(
        service.nextSlotAfter('p1', now).toISOString()
      );
    });

    it('spreads plugins across the day rather than checking them together', () => {
      const slots = new Set(
        Array.from({ length: 40 }, (_, i) => service.nextSlotAfter(`plugin-${i}`, now).getTime())
      );

      expect(slots.size).toBeGreaterThan(30);
    });

    it('lands on a five-minute boundary, which is when the processor wakes up', () => {
      const slot = service.nextSlotAfter('p1', now);

      expect(slot.getUTCMinutes() % 5).toBe(0);
      expect(slot.getUTCSeconds()).toBe(0);
    });

    it('always points into the future', () => {
      for (let i = 0; i < 40; i++) {
        expect(service.nextSlotAfter(`plugin-${i}`, now).getTime()).toBeGreaterThan(now.getTime());
      }
    });

    /**
     * A deployment that was down for a week checks once when it comes back, not once per
     * slot it slept through: the next slot is computed from now, never from the missed
     * one.
     */
    it('catches up once after a long outage', () => {
      const overdue = new Date('2026-08-10T09:00:00.000Z');
      const next = service.nextSlotAfter('p1', overdue);

      expect(next.getTime() - overdue.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });

  describe('who stays on the schedule', () => {
    it('keeps a plugin with an active publication', async () => {
      await expect(setup({ publications: 1 }).service.isUnderMaintenance('p1')).resolves.toBe(true);
    });

    it('keeps a plugin somebody still has installed', async () => {
      await expect(setup({ installations: 2 }).service.isUnderMaintenance('p1')).resolves.toBe(
        true
      );
    });

    it('drops a plugin nothing publishes and nobody has installed', async () => {
      await expect(setup().service.isUnderMaintenance('p1')).resolves.toBe(false);
    });
  });

  // Conditional on purpose: a plugin already on the schedule keeps its slot, so a member
  // asking for a check does not quietly move the deployment's own timetable.
  it('only schedules a plugin that is off maintenance', async () => {
    const s = setup();

    await s.service.ensureScheduled('p1');

    expect(s.builder.andWhere).toHaveBeenCalledWith('nextUpdateCheckAt IS NULL');
  });
});
