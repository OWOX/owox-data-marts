import {
  Video1GoogleSheetsReport,
  Video2LookerAsDestination,
  Video3GettingStartedDataMarts,
  Video4LegacyStorageSetup,
  Video5TryInsights,
} from './popovers';
import { Video6EmailReports } from './popovers/Video6EmailReports';
import type { PopoverConfig, PopoverId } from './types';

export const popoverItems: Record<PopoverId, PopoverConfig> = {
  'video-1-google-sheets': {
    width: 500,
    height: 410,
    position: 'bottom-left',
    title: 'SQL to Google Sheets in Minutes',
    content: Video1GoogleSheetsReport,
  },
  'video-2-looker': {
    width: 500,
    height: 410,
    position: 'bottom-left',
    title: 'Looker Studio Setup',
    content: Video2LookerAsDestination,
  },
  'video-3-getting-started-with-data-marts': {
    width: 500,
    height: 355,
    position: 'bottom-left',
    title: 'Getting Started with Data Marts',
    content: Video3GettingStartedDataMarts,
  },
  'video-4-legacy-storage-setup': {
    width: 500,
    height: 355,
    position: 'bottom-left',
    title: 'Complete BigQuery storage setup to publish Data Marts',
    content: Video4LegacyStorageSetup,
  },
  'video-5-try-insights': {
    width: 500,
    height: 355,
    position: 'bottom-left',
    title: 'Insights: how to get automated reports from questions',
    content: Video5TryInsights,
  },
  'video-6-email-reports': {
    width: 500,
    height: 355,
    position: 'bottom-left',
    title: 'Email reports: how to send reports by email',
    content: Video6EmailReports,
  },
};
