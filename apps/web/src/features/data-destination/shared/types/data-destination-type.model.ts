import { EmailIcon } from '../../../../shared/icons/email-icon.tsx';
import { DataDestinationType } from '../enums';
import { DataDestinationStatus } from '../enums';
import {
  GoogleChatIcon,
  GoogleSheetsIcon,
  LookerStudioIcon,
  MicrosoftTeamsIcon,
  ODataIcon,
  SlackIcon,
} from '../../../../shared';
import type { AppIcon } from '../../../../shared';

interface DataDestinationTypeInfo {
  type: DataDestinationType;
  displayName: string;
  icon: AppIcon;
  status: DataDestinationStatus;
  availableInCommunityEdition?: boolean;
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
    [DataDestinationType.MS_TEAMS]: {
      type: DataDestinationType.MS_TEAMS,
      displayName: 'Microsoft Teams',
      icon: MicrosoftTeamsIcon,
      status: DataDestinationStatus.CLOUD_ONLY,
    },
    [DataDestinationType.GOOGLE_CHAT]: {
      type: DataDestinationType.GOOGLE_CHAT,
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
