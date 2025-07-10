import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { Code, Table, Grip, Asterisk, Server } from 'lucide-react';

export interface DataMartDefinitionTypeInfo {
  type: DataMartDefinitionType | null;
  displayName: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const DataMartDefinitionTypeModel = {
  types: {
    [DataMartDefinitionType.SQL]: {
      type: DataMartDefinitionType.SQL,
      displayName: 'SQL',
      icon: Code,
    },
    [DataMartDefinitionType.TABLE]: {
      type: DataMartDefinitionType.TABLE,
      displayName: 'Table',
      icon: Table,
    },
    [DataMartDefinitionType.VIEW]: {
      type: DataMartDefinitionType.VIEW,
      displayName: 'View',
      icon: Grip,
    },
    [DataMartDefinitionType.TABLE_PATTERN]: {
      type: DataMartDefinitionType.TABLE_PATTERN,
      displayName: 'Pattern',
      icon: Asterisk,
    },
    [DataMartDefinitionType.CONNECTOR]: {
      type: DataMartDefinitionType.CONNECTOR,
      displayName: 'Connector',
      icon: Server,
    },
  },
  getInfo(type: DataMartDefinitionType | null): DataMartDefinitionTypeInfo {
    if (!type) {
      return {
        type: null,
        displayName: '—',
        icon: () => null,
      };
    }
    return this.types[type];
  },
};
