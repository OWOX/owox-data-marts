import { DataDestinationType } from '../enums';
import { DataDestinationStatus } from '../enums';
import { GoogleSheetsIcon, LookerStudioIcon, ODataIcon } from '../../../../shared';
import type { AppIcon } from '../../../../shared';

interface DataDestinationTypeInfo {
  type: DataDestinationType;
  displayName: string;
  icon: AppIcon;
  status: DataDestinationStatus;
}

export const DataDestinationTypeModel = {
  types: {
    [DataDestinationType.GOOGLE_SHEETS]: {
      type: DataDestinationType.GOOGLE_SHEETS,
      displayName: 'Google Sheets',
      icon: GoogleSheetsIcon,
      status: DataDestinationStatus.ACTIVE,
    },
    [DataDestinationType.LOOKER_STUDIO]: {
      type: DataDestinationType.LOOKER_STUDIO,
      displayName: 'Looker Studio',
      icon: LookerStudioIcon,
      status: DataDestinationStatus.ACTIVE,
    },
    [DataDestinationType.ODATA]: {
      type: DataDestinationType.ODATA,
      displayName: 'OData',
      icon: ODataIcon,
      status: DataDestinationStatus.COMING_SOON,
    },
  },

  getInfo(type: DataDestinationType): DataDestinationTypeInfo {
    return this.types[type];
  },

  getAllTypes(): DataDestinationTypeInfo[] {
    return Object.values(this.types);
  },
} as const;
