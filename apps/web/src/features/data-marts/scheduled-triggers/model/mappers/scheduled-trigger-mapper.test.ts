import { describe, expect, it } from 'vitest';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../../enums';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import type { ScheduledConnectorRunConfig } from '../trigger-config.types';
import { ScheduledTriggerMapper } from './scheduled-trigger-mapper';

const fibery: ConnectorListItem = {
  name: 'fibery_api',
  displayName: 'Fibery (owox.fibery.io)',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
};

function connectorTrigger(id: string, sourceName: string): ScheduledTrigger {
  return {
    id,
    type: ScheduledTriggerType.CONNECTOR_RUN,
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_CONNECTOR_RUN,
      connector: {
        connector: {
          source: { name: sourceName, configuration: [], node: 'items', fields: ['id'] },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    },
  } as unknown as ScheduledTrigger;
}

const infoOf = (trigger: ScheduledTrigger) =>
  (trigger.triggerConfig as ScheduledConnectorRunConfig).connector?.connector.info;

describe('ScheduledTriggerMapper.withCustomConnectorInfo', () => {
  it('adds the custom connector info only to the triggers of that connector', () => {
    const report = {
      id: 'report',
      type: ScheduledTriggerType.REPORT_RUN,
      triggerConfig: { type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN, reportId: 'report-1' },
    } as unknown as ScheduledTrigger;
    const bundled = connectorTrigger('bundled', 'FacebookMarketing');
    const custom = connectorTrigger('custom', 'fibery_api');

    const [mappedReport, mappedBundled, mappedCustom] =
      ScheduledTriggerMapper.withCustomConnectorInfo([report, bundled, custom], [fibery]);

    expect(mappedReport).toBe(report);
    expect(infoOf(mappedBundled)).toBeUndefined();
    expect(infoOf(mappedCustom)).toBe(fibery);
  });
});
