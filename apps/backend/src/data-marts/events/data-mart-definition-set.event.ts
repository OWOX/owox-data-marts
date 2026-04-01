import { BaseEvent } from '@owox/internal-helpers';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

export interface DataMartDefinitionSetEventPayload {
  dataMartId: string;
  projectId: string;
  createdById: string;
  definitionType?: DataMartDefinitionType;
}

export class DataMartDefinitionSetEvent extends BaseEvent<DataMartDefinitionSetEventPayload> {
  get name() {
    return 'data-mart.definition.set' as const;
  }

  constructor(
    dataMartId: string,
    projectId: string,
    createdById: string,
    definitionType?: DataMartDefinitionType
  ) {
    super({ dataMartId, projectId, createdById, definitionType });
  }
}
