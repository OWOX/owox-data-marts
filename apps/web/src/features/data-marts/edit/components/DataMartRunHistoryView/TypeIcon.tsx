import { Database } from 'lucide-react';
import { DataDestinationType, DataDestinationTypeModel } from '../../../../data-destination';
import { DataMartRunType } from '../../../shared';
import { RawBase64Icon } from '../../../../../shared/icons';

const iconSize = 18;

interface DataMartRunTypeIconProps {
  type: DataMartRunType | null;
  base64Icon: string | null | undefined;
}

export function TypeIcon({ type, base64Icon }: DataMartRunTypeIconProps) {
  switch (type) {
    case DataMartRunType.CONNECTOR:
      return base64Icon ? (
        <RawBase64Icon base64={base64Icon} size={iconSize} />
      ) : (
        <Database size={iconSize} />
      );

    case DataMartRunType.GOOGLE_SHEETS_EXPORT: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.GOOGLE_SHEETS).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.LOOKER_STUDIO: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.LOOKER_STUDIO).icon;
      return <Icon size={iconSize} />;
    }
    default:
      return <Database size={iconSize} />;
  }
}
