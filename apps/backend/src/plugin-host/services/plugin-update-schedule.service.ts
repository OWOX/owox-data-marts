import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginPublication } from '../entities/plugin-publication.entity';
import { Plugin } from '../entities/plugin.entity';

/** Five-minute slots across the day, which is also how often the processor wakes up. */
const SLOT_MINUTES = 5;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When each plugin is checked for a newer release.
 *
 * Every plugin under maintenance gets one check per 24 hours at its own time of day,
 * derived from its id rather than drawn at random: the slot survives restarts, spreads
 * GitHub traffic and activations across the day, and stays the same after a
 * member-requested check, which accelerates a check without moving the schedule.
 *
 * A plugin nothing publishes and nobody has installed does not need checking, and drops
 * off the schedule until something puts it back.
 */
@Injectable()
export class PluginUpdateScheduleService {
  constructor(
    @InjectRepository(Plugin)
    private readonly plugins: Repository<Plugin>,
    @InjectRepository(PluginPublication)
    private readonly publications: Repository<PluginPublication>,
    @InjectRepository(PluginInstallation)
    private readonly installations: Repository<PluginInstallation>
  ) {}

  /**
   * The next time this plugin's own slot comes round, strictly after `now`.
   *
   * Advancing from `now` rather than from the missed slot is what makes an overdue check
   * catch up once instead of replaying every slot a stopped deployment slept through.
   */
  nextSlotAfter(pluginId: string, now: Date): Date {
    const slot = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        this.slotIndexOf(pluginId) * SLOT_MINUTES
      )
    );

    return slot.getTime() > now.getTime() ? slot : new Date(slot.getTime() + DAY_MS);
  }

  /**
   * Puts a plugin on the schedule if it is not already on it.
   *
   * Returns true when it was off maintenance, which is the caller's signal that the
   * recorded release may be stale and worth checking before the action completes.
   */
  async ensureScheduled(pluginId: string, now: Date = new Date()): Promise<boolean> {
    const result = await this.plugins
      .createQueryBuilder()
      .update(Plugin)
      .set({ nextUpdateCheckAt: this.nextSlotAfter(pluginId, now) })
      .where('id = :pluginId', { pluginId })
      .andWhere('nextUpdateCheckAt IS NULL')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  /** Moves a checked plugin to its next slot. Only automatic checks call this. */
  async reschedule(pluginId: string, now: Date = new Date()): Promise<void> {
    await this.plugins.update(pluginId, { nextUpdateCheckAt: this.nextSlotAfter(pluginId, now) });
  }

  async dropFromSchedule(pluginId: string): Promise<void> {
    await this.plugins.update(pluginId, { nextUpdateCheckAt: null });
  }

  listDue(now: Date, limit: number): Promise<Plugin[]> {
    return this.plugins.find({
      where: { nextUpdateCheckAt: LessThanOrEqual(now) },
      order: { nextUpdateCheckAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * A plugin stays on the schedule while at least one active publication or installation
   * depends on it. Suspension is deliberately not a reason to stop: a corrective higher
   * version has to be able to become current while invocation is still blocked.
   */
  async isUnderMaintenance(pluginId: string): Promise<boolean> {
    const published = await this.publications.countBy({ pluginId, isActive: true });
    if (published > 0) {
      return true;
    }

    return (await this.installations.countBy({ pluginId, uninstalledAt: IsNull() })) > 0;
  }

  /**
   * Stable slot from the plugin id, by FNV-1a.
   *
   * Any fixed hash would do; what matters is that it does not move between restarts and
   * that neighbouring uuids do not land in the same slot.
   */
  private slotIndexOf(pluginId: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < pluginId.length; i++) {
      hash ^= pluginId.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash % SLOTS_PER_DAY;
  }
}
