import { FieldsSelectionStep } from './FieldsSelectionStep.tsx';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/types/response';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

// FieldsSelectionStep renders OpenIssueLink, which needs a router context.
function renderStep(props: ComponentProps<typeof FieldsSelectionStep>) {
  return render(
    <MemoryRouter>
      <FieldsSelectionStep {...props} />
    </MemoryRouter>
  );
}

const connector: ConnectorListItem = {
  name: 'TikTokAds',
  displayName: 'TikTok Ads',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const connectorFields: ConnectorFieldsResponseApiDto[] = [
  {
    name: 'ad_insights',
    uniqueKeys: ['ad_id', 'stat_time_day'],
    uniqueKeysByDataLevel: {
      AUCTION_ADVERTISER: ['stat_time_day'],
      AUCTION_CAMPAIGN: ['campaign_id', 'stat_time_day'],
      AUCTION_ADGROUP: ['adgroup_id', 'stat_time_day'],
      AUCTION_AD: ['ad_id', 'stat_time_day'],
    },
    fields: [
      { name: 'ad_id' },
      { name: 'campaign_id' },
      { name: 'adgroup_id' },
      { name: 'stat_time_day' },
      { name: 'impressions' },
    ],
  },
];

const noop = () => {
  /* not under test */
};

describe('FieldsSelectionStep — Data Level unique key pinning', () => {
  it('pins only stat_time_day and leaves ad_id toggleable at AUCTION_ADVERTISER', () => {
    renderStep({
      connector,
      connectorFields,
      selectedField: 'ad_insights',
      selectedFields: ['stat_time_day', 'impressions'],
      configuration: { DataLevel: 'AUCTION_ADVERTISER' },
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.getByRole('checkbox', { name: 'stat_time_day' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'ad_id' })).not.toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'campaign_id' })).not.toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'adgroup_id' })).not.toBeDisabled();
  });

  it('pins ad_id at AUCTION_AD', () => {
    renderStep({
      connector,
      connectorFields,
      selectedField: 'ad_insights',
      selectedFields: ['ad_id', 'stat_time_day', 'impressions'],
      configuration: { DataLevel: 'AUCTION_AD' },
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.getByRole('checkbox', { name: 'ad_id' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'stat_time_day' })).toBeDisabled();
  });

  it('pins campaign_id at AUCTION_CAMPAIGN and leaves ad_id toggleable', () => {
    renderStep({
      connector,
      connectorFields,
      selectedField: 'ad_insights',
      selectedFields: ['campaign_id', 'stat_time_day', 'impressions'],
      configuration: { DataLevel: 'AUCTION_CAMPAIGN' },
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.getByRole('checkbox', { name: 'campaign_id' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'stat_time_day' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'ad_id' })).not.toBeDisabled();
  });

  it('falls back to the static uniqueKeys when no Data Level is configured', () => {
    renderStep({
      connector,
      connectorFields,
      selectedField: 'ad_insights',
      selectedFields: ['ad_id', 'stat_time_day', 'impressions'],
      configuration: {},
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.getByRole('checkbox', { name: 'ad_id' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'stat_time_day' })).toBeDisabled();
  });
});

describe('FieldsSelectionStep — Data Level tip is node-name agnostic', () => {
  // Gating on uniqueKeysByDataLevel presence (not a hardcoded node name list) means any
  // connector/node exposing it gets the same pinning + tip behavior for free.
  const genericNodeFields: ConnectorFieldsResponseApiDto[] = [
    {
      name: 'some_other_node',
      uniqueKeys: ['id', 'date'],
      uniqueKeysByDataLevel: { DAILY: ['date'], CAMPAIGN: ['campaign_id', 'date'] },
      fields: [{ name: 'id' }, { name: 'campaign_id' }, { name: 'date' }],
    },
  ];

  it('shows the tip and pins fields for a non-TikTok node name that has uniqueKeysByDataLevel', () => {
    renderStep({
      connector,
      connectorFields: genericNodeFields,
      selectedField: 'some_other_node',
      selectedFields: ['date'],
      configuration: { DataLevel: 'DAILY' },
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.getByText(/Required fields depend on Data Level/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'date' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'campaign_id' })).not.toBeDisabled();
  });

  it('hides the tip for a node without uniqueKeysByDataLevel, even with a Data Level set', () => {
    const nodeWithoutDataLevelKeys: ConnectorFieldsResponseApiDto[] = [
      { name: 'catalog_node', uniqueKeys: ['id'], fields: [{ name: 'id' }] },
    ];

    renderStep({
      connector,
      connectorFields: nodeWithoutDataLevelKeys,
      selectedField: 'catalog_node',
      selectedFields: ['id'],
      configuration: { DataLevel: 'DAILY' },
      onFieldToggle: noop,
      onSelectAllFields: noop,
    });

    expect(screen.queryByText(/Required fields depend on Data Level/)).not.toBeInTheDocument();
  });
});

const googleSheetsConnector: ConnectorListItem = {
  name: 'GoogleSheets',
  displayName: 'Google Sheets',
  description: '',
  logoBase64: null,
  docUrl: null,
};

describe('FieldsSelectionStep Google Sheets technical fields', () => {
  it('uses ordinary unique-key behavior without locking _owox_imported_at', () => {
    render(
      <MemoryRouter>
        <FieldsSelectionStep
          connector={googleSheetsConnector}
          connectorFields={[
            {
              name: 'sheet',
              uniqueKeys: ['_owox_row_number'],
              defaultFields: [],
              fields: [
                { name: '_owox_row_number', type: 'INTEGER' },
                { name: '_owox_imported_at', type: 'TIMESTAMP' },
                { name: 'Campaign', type: 'STRING' },
              ],
            },
          ]}
          selectedField='sheet'
          selectedFields={['_owox_row_number']}
          onFieldToggle={vi.fn()}
          onSelectAllFields={vi.fn()}
          itemLabel='columns'
          autoSelectDefaultFields={false}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('checkbox', { name: '_owox_row_number' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '_owox_imported_at' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Campaign' })).toBeEnabled();
  });
});
