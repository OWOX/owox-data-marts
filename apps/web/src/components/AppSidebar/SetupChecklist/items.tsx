import { InviteTeammatesCard } from '../../../shared/components/InviteTeammatesCard';
import type { SetupGroup, SetupStep } from './types';

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create_storage',
    label: 'Create storage',
    stepTitle: 'Create storage',
    stepDescription:
      'Storage is a connection to your data warehouse (BigQuery, Snowflake, etc.). It is required to create and run Data Marts.',
    ctaLabel: 'Create storage',
    successMessageTitle: 'Storage created',
    linkPath: '/data-storages',
    progressKey: 'hasStorage',
  },
  {
    id: 'create_data_mart',
    label: 'Create draft Data Mart',
    stepTitle: 'Create draft Data Mart',
    stepDescription: 'A Data Mart defines what data to collect or transform.',
    ctaLabel: 'Create draft Data Mart',
    successMessageTitle: 'Draft Data Mart created',
    linkPath: '/data-marts/create',
    progressKey: 'hasDraftDataMart',
  },
  {
    id: 'publish_data_mart',
    label: 'Publish Data Mart',
    stepTitle: 'Publish Data Mart',
    stepDescription: 'Publishing a Data Mart makes it available for Reports and Triggers.',
    ctaLabel: 'Publish Data Mart',
    successMessageTitle: 'Data Mart published',
    linkPath: '/data-marts',
    progressKey: 'hasPublishedDataMart',
  },
  {
    id: 'create_destination',
    label: 'Create destination',
    stepTitle: 'Create destination',
    stepDescription:
      'Destinations are where your reports are delivered — Google Sheets, Looker Studio, Email, and more.',
    ctaLabel: 'Create destination',
    successMessageTitle: 'Destination created',
    linkPath: '/data-destinations',
    progressKey: 'hasDestination',
  },
  {
    id: 'create_report',
    label: 'Create report',
    stepTitle: 'Create report',
    stepDescription:
      'Reports send data from a published Data Mart to a destination on a schedule or on demand.',
    ctaLabel: 'Choose Data Mart and create report',
    successMessageTitle: 'Report created',
    linkPath: '/data-marts',
    progressKey: 'hasReport',
  },
  {
    id: 'report_run',
    label: 'Run your report',
    stepTitle: 'Run your report',
    stepDescription: 'Run your report at least once to generate results.',
    ctaLabel: 'Choose Data Mart and run',
    successMessageTitle: 'Report run successfully',
    linkPath: '/data-marts',
    progressKey: 'hasReportRun',
  },
  {
    id: 'invite_teammates',
    label: 'Invite teammates',
    stepTitle: 'Invite teammates',
    stepDescription: 'Invite your teammates to collaborate in OWOX.',
    ctaLabel: 'Invite teammates',
    successMessageTitle: 'Teammates invited',
    linkPath: <InviteTeammatesCard variant='button' />,
    progressKey: 'hasTeammatesInvited',
  },
];

export const SETUP_GROUPS: SetupGroup[] = [
  {
    id: 'group_storage',
    title: 'Create storage',
    description: 'Connect your data warehouse to start working with OWOX.',
    stepIds: ['create_storage'],
  },
  {
    id: 'group_publish',
    title: 'Publish Data Mart',
    description: 'Set up storage credentials, create, and publish your first Data Mart.',
    stepIds: ['create_data_mart', 'publish_data_mart'],
  },
  {
    id: 'group_report',
    title: 'Get data to your report',
    description: 'Create a destination, report, and run it to get results.',
    stepIds: ['create_destination', 'create_report', 'report_run'],
  },
  {
    id: 'group_invite_teammates',
    title: 'Invite teammates',
    description: 'Invite your teammates to collaborate in OWOX.',
    stepIds: ['invite_teammates'],
  },
];
