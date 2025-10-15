import { DataMartDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/data-mart-definition';

export type ConnectorRunDetails = {
  definitionRun?: DataMartDefinition;
  logs?: string[];
  errors?: string[];
  additionalParams?: Record<string, unknown>;
};
