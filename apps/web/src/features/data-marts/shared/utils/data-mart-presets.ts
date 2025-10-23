import { DataMartDefinitionType } from '../../shared';
import type { AppIcon } from '../../../../shared/icons';
import { XAdsIcon, FacebookAdsIcon, LinkedInAdsIcon } from '../../../../shared';
import { Code, Plug, Box } from 'lucide-react';

// Keys list and type
export const DATA_MART_PRESETS = [
  'facebook',
  'x',
  'linkedin',
  'connector',
  'sql',
  'blank',
] as const;

export type DataMartPresetKey = (typeof DATA_MART_PRESETS)[number];

// Interface for a preset config
export interface DataMartPreset {
  title: string;
  datamartTitle?: string;
  connectorSourceTitle?: string;
  definitionType?: DataMartDefinitionType;
  icon?: AppIcon;
}

// Record map
export const dataMartPresetsMap: Record<DataMartPresetKey, DataMartPreset> = {
  facebook: {
    title: 'Facebook Ads',
    datamartTitle: 'Facebook Ads Data Mart',
    connectorSourceTitle: 'FacebookMarketing',
    definitionType: DataMartDefinitionType.CONNECTOR,
    icon: FacebookAdsIcon,
  },
  x: {
    title: 'X Ads',
    datamartTitle: 'X Ads Data Mart',
    connectorSourceTitle: 'XAds',
    definitionType: DataMartDefinitionType.CONNECTOR,
    icon: XAdsIcon,
  },
  linkedin: {
    title: 'LinkedIn Ads',
    datamartTitle: 'LinkedIn Ads Data Mart',
    connectorSourceTitle: 'LinkedInAds',
    definitionType: DataMartDefinitionType.CONNECTOR,
    icon: LinkedInAdsIcon,
  },
  connector: {
    title: 'Other connector',
    datamartTitle: 'Connector-based Data Mart',
    definitionType: DataMartDefinitionType.CONNECTOR,
    icon: Plug,
  },
  sql: {
    title: 'Start with SQL query',
    datamartTitle: 'SQL-based Data Mart',
    definitionType: DataMartDefinitionType.SQL,
    icon: Code,
  },
  blank: {
    title: 'Create blank Data Mart',
    datamartTitle: 'New Data Mart',
    icon: Box,
  },
};

// Derived array for UI iteration (buttons, lists)
export const dataMartPresetsList: (DataMartPreset & { key: DataMartPresetKey })[] =
  DATA_MART_PRESETS.map(key => ({
    key,
    ...dataMartPresetsMap[key],
  }));

// Optional helper for safe lookup
export function getDataMartPreset(
  key?: string | null
): (DataMartPreset & { key: DataMartPresetKey }) | undefined {
  if (!key || !DATA_MART_PRESETS.includes(key as DataMartPresetKey)) {
    return undefined;
  }
  const presetKey = key as DataMartPresetKey;
  return { key: presetKey, ...dataMartPresetsMap[presetKey] };
}
