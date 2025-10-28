import { DataDestinationType, DataDestinationTypeModel } from '../../../../data-destination';
import { DataMartRunType } from '../../../shared';
import { RawBase64Icon } from '../../../../../shared/icons';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';

const iconSize = 18;

interface DataMartRunTypeIconProps {
  type: DataMartRunType | null;
  connectorInfo: ConnectorListItem | null;
}

export function TypeIcon({ type, connectorInfo }: DataMartRunTypeIconProps) {
  switch (type) {
    case DataMartRunType.CONNECTOR: {
      if (connectorInfo?.logoBase64) {
        return <RawBase64Icon base64={connectorInfo.logoBase64} size={iconSize} />;
      }
      return null;
    }
    case DataMartRunType.GOOGLE_SHEETS_EXPORT: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.GOOGLE_SHEETS).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.LOOKER_STUDIO: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.LOOKER_STUDIO).icon;
      return <Icon size={iconSize} />;
    }
    default:
      return null;
  }
}
