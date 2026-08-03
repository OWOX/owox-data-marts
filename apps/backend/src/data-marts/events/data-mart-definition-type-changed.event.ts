import { BaseEvent } from '@owox/internal-helpers';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

export interface DataMartDefinitionTypeChangedEventPayload {
  dataMartId: string;
  projectId: string;
  previousDefinitionType: DataMartDefinitionType;
  definitionType: DataMartDefinitionType;
  createdById: string;
}

export class DataMartDefinitionTypeChangedEvent extends BaseEvent<DataMartDefinitionTypeChangedEventPayload> {
  get name() {
    return 'data-mart.definition-type.changed' as const;
  }

  constructor(
    dataMartId: string,
    projectId: string,
    previousDefinitionType: DataMartDefinitionType,
    definitionType: DataMartDefinitionType,
    createdById: string
  ) {
    super({ dataMartId, projectId, previousDefinitionType, definitionType, createdById });
  }
}
