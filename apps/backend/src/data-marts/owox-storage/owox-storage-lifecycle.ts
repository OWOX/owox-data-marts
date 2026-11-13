import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import type { OwoxStorageSettings } from './owox-storage-settings';

export type OwoxStorageDeletionReason = 'NOT_PAID' | 'INACTIVE';

export const DAY_MS = 86_400_000;

const after = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS);

export function scheduledDeletion(
  record: Pick<ManagedStorage, 'notPaidSince' | 'lastActivityAt' | 'createdAt'>,
  plan: ProjectPlanType,
  days: Pick<OwoxStorageSettings, 'notPaidDeletionDays' | 'inactivityDeletionDays'>,
  now: Date
): { reason: OwoxStorageDeletionReason; date: Date } | null {
  if (plan === ProjectPlanType.PAID) return null;
  if (plan === ProjectPlanType.NOT_PAID) {
    return {
      reason: 'NOT_PAID',
      date: after(record.notPaidSince ?? now, days.notPaidDeletionDays),
    };
  }
  // A project that just left NOT_PAID starts its inactivity period today.
  const from = record.notPaidSince ? now : (record.lastActivityAt ?? record.createdAt);
  return { reason: 'INACTIVE', date: after(from, days.inactivityDeletionDays) };
}
