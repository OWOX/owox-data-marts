import { Video1GoogleSheetsReport } from './Video1GoogleSheetsReport';
import { Video2LookerAsDestination } from './Video2LookerAsDestination';

export const popoverItems = {
  'video-1-google-sheets': {
    width: 500,
    height: 410,
    position: 'bottom-left',
    content: Video1GoogleSheetsReport,
  },
  'video-2-looker': {
    width: 500,
    height: 410,
    position: 'bottom-left',
    content: Video2LookerAsDestination,
  },
} as const;
