import { InviteTeammatesCard } from '../../../shared/components/InviteTeammatesCard';
import type { SetupGroup, SetupStep } from './types';

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create_storage',
    label: 'Create storage',
    popoverTitle: 'Create storage',
    popoverDescription:
      'Storage is a connection to your data warehouse (BigQuery, Snowflake, etc.). It is required to create and run Data Marts.',
    ctaLabel: 'Create storage',
    successTitle: 'Storage created',
    successDescription: 'You can connect multiple data warehouses.',
    linkPath: '/data-storages',
    progressKey: 'hasStorage',
  },
  {
    id: 'create_data_mart',
    label: 'Create draft Data Mart',
    popoverTitle: 'Create draft Data Mart',
    popoverDescription: 'A Data Mart defines what data to collect or transform.',
    ctaLabel: 'Create draft Data Mart',
    successTitle: 'Draft Data Mart created',
    successDescription: 'Publish it to make it available for Reports and Triggers.',
    linkPath: '/data-marts/create',
    progressKey: 'hasDraftDataMart',
  },
  {
    id: 'publish_data_mart',
    label: 'Publish Data Mart',
    popoverTitle: 'Publish Data Mart',
    popoverDescription: 'Publishing a Data Mart makes it available for Reports and Triggers.',
    ctaLabel: 'Publish Data Mart',
    successTitle: 'Data Mart published',
    successDescription: 'It is now available for Reports and Triggers.',
    linkPath: '/data-marts',
    progressKey: 'hasPublishedDataMart',
  },
  {
    id: 'create_destination',
    label: 'Create destination',
    popoverTitle: 'Create destination',
    popoverDescription:
      'Destinations are where your reports are delivered — Google Sheets, Looker Studio, Email, and more.',
    ctaLabel: 'Create destination',
    successTitle: 'Destination created',
    successDescription: 'Add more destinations to deliver data to different places.',
    linkPath: '/data-destinations',
    progressKey: 'hasDestination',
  },
  {
    id: 'create_report',
    label: 'Create report',
    popoverTitle: 'Create report',
    popoverDescription:
      'Reports send data from a published Data Mart to a destination on a schedule or on demand.',
    ctaLabel: 'Choose Data Mart and create report',
    successTitle: 'Report created',
    successDescription: 'Create more reports across your Data Marts.',
    linkPath: '/data-marts',
    progressKey: 'hasReport',
  },
  {
    id: 'report_run',
    label: 'Run your report',
    popoverTitle: 'Run your report',
    popoverDescription: 'Run your report at least once to generate results.',
    ctaLabel: 'Choose Data Mart and run',
    successTitle: 'Report run successfully',
    successDescription: 'Results generated.',
    linkPath: '/data-marts',
    progressKey: 'hasReportRun',
  },
  {
    id: 'invite_teammates',
    label: 'Invite teammates',
    popoverTitle: 'Invite teammates',
    popoverDescription: 'Invite your teammates to collaborate in OWOX.',
    ctaLabel: 'Invite teammates',
    successTitle: 'Teammates invited',
    successDescription: 'Your teammates have been invited to OWOX.',
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
