import { DataDestinationType } from '../enums';
import { GoogleSheetsIcon } from '../../../../shared';
import type { AppIcon } from '../../../../shared';

interface DataDestinationTypeInfo {
  type: DataDestinationType;
  displayName: string;
  icon: AppIcon;
}

export const DataDestinationTypeModel = {
  types: {
    [DataDestinationType.GOOGLE_SHEETS]: {
      type: DataDestinationType.GOOGLE_SHEETS,
      displayName: 'Google Sheets',
      icon: GoogleSheetsIcon,
    },
  },

  getInfo(type: DataDestinationType): DataDestinationTypeInfo {
    return this.types[type];
  },

  getAllTypes(): DataDestinationTypeInfo[] {
    return Object.values(this.types);
  },
} as const;
