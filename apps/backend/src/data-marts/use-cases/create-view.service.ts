import { Injectable } from '@nestjs/common';
import { CreateViewExecutorFacade } from '../data-storage-types/facades/create-view-executor.facade';
import { DataMartService } from '../services/data-mart.service';
import { CreateViewCommand } from '../dto/domain/create-view.command';
import { CreateViewResult } from '../data-storage-types/interfaces/create-view-executor.interface';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';

/**
 * Creates or replaces a view in the underlying storage using the provided SQL.
 * Mirrors the structure of SqlDryRunService but performs a side-effect (DDL).
 */
@Injectable()
export class CreateViewService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly createViewExecutorFacade: CreateViewExecutorFacade,
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  async run(command: CreateViewCommand): Promise<CreateViewResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    if (!dataMart.definition) {
      throw new Error('Data Mart definition is not set.');
    }

    const storage = dataMart.storage;
    if (!storage?.type || !storage.config) {
      throw new Error('Storage setup is not finished.');
    }
    if (!storage.credentials && !storage.credentialId) {
      throw new Error('Storage setup is not finished.');
    }

    if (!isSqlDefinition(dataMart.definition)) {
      throw new Error('Only SQL-based Data Mart definitions are supported for view creation.');
    }

    const credentials = await this.credentialsResolver.resolve(storage);

    return this.createViewExecutorFacade.createView(
      storage.type,
      credentials,
      storage.config,
      command.viewName,
      dataMart.definition.sqlQuery
    );
  }
}
