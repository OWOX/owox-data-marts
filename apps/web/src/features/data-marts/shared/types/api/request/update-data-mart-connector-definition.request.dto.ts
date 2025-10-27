import type { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { ConnectorDefinitionDto } from '../shared';

export interface UpdateDataMartConnectorDefinitionRequestDto {
  definitionType: DataMartDefinitionType.CONNECTOR;
  definition: ConnectorDefinitionDto;
  sourceDataMartId?: string;
  sourceConfigurationIndex?: number;
}
