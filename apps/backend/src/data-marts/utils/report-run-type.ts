import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

export function toReportRunType(dataDestinationType: DataDestinationType): DataMartRunType {
  switch (dataDestinationType) {
    case DataDestinationType.GOOGLE_SHEETS:
      return DataMartRunType.GOOGLE_SHEETS_EXPORT;
    case DataDestinationType.LOOKER_STUDIO:
      return DataMartRunType.LOOKER_STUDIO;
    case DataDestinationType.EMAIL:
      return DataMartRunType.EMAIL;
    case DataDestinationType.SLACK:
      return DataMartRunType.SLACK;
    case DataDestinationType.GOOGLE_CHAT:
      return DataMartRunType.GOOGLE_CHAT;
    case DataDestinationType.MS_TEAMS:
      return DataMartRunType.MS_TEAMS;
    default:
      throw Error(`Unexpected Data Destination Type - ${dataDestinationType}`);
  }
}
