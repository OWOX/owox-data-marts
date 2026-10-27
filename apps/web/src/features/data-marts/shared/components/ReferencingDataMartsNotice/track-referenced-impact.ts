import { trackEvent } from '../../../../../utils';

/**
 * Records that the user went ahead with deleting Data Marts that other Data Marts reference in
 * their SQL. Nothing is sent when no reference was shown.
 */
export function trackReferencedDeleteConfirmed(context: string | null, total: number): void {
  if (total <= 0) return;
  trackEvent({
    event: 'data_mart_reference_impact_confirmed',
    category: 'DataMart',
    action: 'ConfirmReferencedDelete',
    context,
    value: String(total),
  });
}
