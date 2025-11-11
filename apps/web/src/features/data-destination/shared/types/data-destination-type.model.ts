import { DataDestinationType } from '../enums';
import { DataDestinationStatus } from '../enums';
import {
  GoogleSheetsIcon,
  LookerStudioIcon,
  ODataIcon,
  EmailIcon,
  MicrosoftTeamsIcon,
  SlackIcon,
  GoogleChatIcon,
} from '../../../../shared';
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
    [DataDestinationType.EMAIL]: {
      type: DataDestinationType.EMAIL,
      displayName: 'Email',
      icon: EmailIcon,
      status: DataDestinationStatus.CLOUD_ONLY,
    },
    [DataDestinationType.SLACK]: {
      type: DataDestinationType.SLACK,
      displayName: 'Slack',
      icon: SlackIcon,
      status: DataDestinationStatus.CLOUD_ONLY,
    },
    [DataDestinationType.MICROSOFTTEAMS]: {
      type: DataDestinationType.MICROSOFTTEAMS,
      displayName: 'Microsoft Teams',
      icon: MicrosoftTeamsIcon,
      status: DataDestinationStatus.CLOUD_ONLY,
    },
    [DataDestinationType.GOOGLECHAT]: {
      type: DataDestinationType.GOOGLECHAT,
      displayName: 'Google Chat',
      icon: GoogleChatIcon,
      status: DataDestinationStatus.CLOUD_ONLY,
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
