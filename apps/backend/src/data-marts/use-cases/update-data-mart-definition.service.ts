import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ConnectorSecretService } from '../services/connector-secret.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class UpdateDataMartDefinitionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    private readonly connectorSecretService: ConnectorSecretService
  ) {}

  async run(command: UpdateDataMartDefinitionCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (dataMart.definitionType && dataMart.definitionType !== command.definitionType) {
      throw new BusinessViolationException('DataMart already has definition');
    }
    dataMart.definitionType = command.definitionType;

    if (command.definitionType === DataMartDefinitionType.CONNECTOR && command.definition) {
      if (command.sourceDataMartId && command.sourceConfigurationIndex !== undefined) {
        const sourceDataMart = await this.dataMartService.getByIdAndProjectId(
          command.sourceDataMartId,
          command.projectId
        );

        if (
          !sourceDataMart.definition ||
          sourceDataMart.definitionType !== DataMartDefinitionType.CONNECTOR
        ) {
          throw new BusinessViolationException(
            'Source Data Mart does not have a connector definition'
          );
        }

        dataMart.definition = await this.connectorSecretService.mergeDefinitionSecretsFromSource(
          command.definition as ConnectorDefinition,
          sourceDataMart.definition as ConnectorDefinition,
          command.sourceConfigurationIndex
        );
      } else {
        dataMart.definition = await this.connectorSecretService.mergeDefinitionSecrets(
          command.definition as ConnectorDefinition,
          dataMart.definition as ConnectorDefinition | undefined
        );
      }
    } else {
      dataMart.definition = command.definition;
    }

    if (dataMart.definitionType !== DataMartDefinitionType.SQL) {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
    }

    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
