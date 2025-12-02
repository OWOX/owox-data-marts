import { Database, Sparkles } from 'lucide-react';
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
        <Database className='text-muted-foreground' size={iconSize} />
      );

    case DataMartRunType.GOOGLE_SHEETS_EXPORT: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.GOOGLE_SHEETS).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.LOOKER_STUDIO: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.LOOKER_STUDIO).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.EMAIL: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.EMAIL).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.SLACK: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.SLACK).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.MS_TEAMS: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.MS_TEAMS).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.GOOGLE_CHAT: {
      const Icon = DataDestinationTypeModel.getInfo(DataDestinationType.GOOGLE_CHAT).icon;
      return <Icon size={iconSize} />;
    }
    case DataMartRunType.INSIGHT: {
      return <Sparkles className='text-brand-blue-500' size={iconSize} />;
    }
    default:
      return <Database className='text-muted-foreground' size={iconSize} />;
  }
}
