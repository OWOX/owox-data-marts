import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';

export class UpdateDataMartDefinitionCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly definitionType: DataMartDefinitionType,
    public readonly definition: DataMartDefinition,
    public readonly sourceDataMartId?: string,
    public readonly sourceConfigurationId?: string
  ) {}
}
