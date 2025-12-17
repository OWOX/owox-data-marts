import {
  Video1GoogleSheetsReport,
  Video2LookerAsDestination,
  Video3GettingStartedDataMarts,
} from './popovers';
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
};
