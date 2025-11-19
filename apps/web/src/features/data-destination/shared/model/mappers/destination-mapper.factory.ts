import { DataDestinationType } from '../../enums';
import type {
  EmailDataDestination,
  GoogleChatDataDestination,
  MsTeamsDataDestination,
  SlackDataDestination,
} from '../types';
import type { DestinationMapper } from './destination-mapper.interface.ts';
import { EmailMapper } from './email.mapper.ts';
import { GoogleSheetsMapper } from './google-sheets.mapper.ts';
import { LookerStudioMapper } from './looker-studio.mapper.ts';

export const DestinationMapperFactory = {
  getMapper(type: DataDestinationType): DestinationMapper {
    switch (type) {
      case DataDestinationType.GOOGLE_SHEETS:
        return new GoogleSheetsMapper();
      case DataDestinationType.LOOKER_STUDIO:
        return new LookerStudioMapper();
      case DataDestinationType.EMAIL:
        return new EmailMapper<EmailDataDestination>(DataDestinationType.EMAIL);
      case DataDestinationType.SLACK:
        return new EmailMapper<SlackDataDestination>(DataDestinationType.SLACK);
      case DataDestinationType.MS_TEAMS:
        return new EmailMapper<MsTeamsDataDestination>(DataDestinationType.MS_TEAMS);
      case DataDestinationType.GOOGLE_CHAT:
        return new EmailMapper<GoogleChatDataDestination>(DataDestinationType.GOOGLE_CHAT);
      default:
        throw new Error(`Unknown destination type: ${type}`);
    }
  },
};
