import { BaseEvent } from '@owox/internal-helpers';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

export interface DataMartDefinitionTypeSetEventPayload {
  dataMartId: string;
  projectId: string;
  definitionType: DataMartDefinitionType;
  createdById: string;
}

export class DataMartDefinitionTypeSetEvent extends BaseEvent<DataMartDefinitionTypeSetEventPayload> {
  get name() {
    return 'data-mart.definition-type.set' as const;
  }

  constructor(
    dataMartId: string,
    projectId: string,
    definitionType: DataMartDefinitionType,
    createdById: string
  ) {
    super({ dataMartId, projectId, definitionType, createdById });
  }
}
