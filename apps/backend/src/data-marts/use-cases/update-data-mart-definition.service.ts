import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';

@Injectable()
export class UpdateDataMartDefinitionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    private readonly connectorSecretService: ConnectorSecretService,
    private readonly legacyDataMartsService: LegacyDataMartsService
  ) {}

  async run(command: UpdateDataMartDefinitionCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (dataMart.definitionType && dataMart.definitionType !== command.definitionType) {
      throw new BusinessViolationException('DataMart already has definition');
    }

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      if (command.definitionType !== DataMartDefinitionType.SQL) {
        throw new BusinessViolationException(
          'Only SQL definition type is supported for Legacy Google BigQuery data storages.'
        );
      }

      await this.legacyDataMartsService.updateQuery(
        dataMart.id,
        (command.definition as SqlDefinition).sqlQuery
      );
    }

    dataMart.definitionType = command.definitionType;

    if (command.definitionType === DataMartDefinitionType.CONNECTOR && command.definition) {
      const connectorDefinition = command.definition as ConnectorDefinition;
      let mergedDefinition: ConnectorDefinition;

      if (command.sourceDataMartId) {
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

        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecretsFromSource(
          connectorDefinition,
          sourceDataMart.definition as ConnectorDefinition
        );

        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          mergedDefinition,
          dataMart.definition as ConnectorDefinition | undefined
        );
      } else {
        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          connectorDefinition,
          dataMart.definition as ConnectorDefinition | undefined
        );
      }

      // Store previous definition for orphaned secrets cleanup
      const previousDefinition = dataMart.definition as ConnectorDefinition | undefined;

      // Extract non-OAuth secrets and save them to a separate table
      dataMart.definition = await this.connectorSecretService.extractAndSaveSecrets(
        dataMart.id,
        command.projectId,
        connectorDefinition.connector.source.name,
        mergedDefinition
      );

      // Delete secrets for configuration items that were removed
      const currentConfigIds = new Set(
        (dataMart.definition as ConnectorDefinition).connector.source.configuration
          .map(item => (item as Record<string, unknown>)._id as string)
          .filter((id): id is string => !!id)
      );
      await this.connectorSecretService.deleteOrphanedSecrets(
        dataMart.id,
        currentConfigIds,
        previousDefinition
      );
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
