import { Video1GoogleSheetsReport } from './popovers/Video1GoogleSheetsReport';
import { Video2LookerAsDestination } from './popovers/Video2LookerAsDestination';
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
};
