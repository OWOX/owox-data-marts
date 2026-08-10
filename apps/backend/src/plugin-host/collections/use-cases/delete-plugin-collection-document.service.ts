import { Injectable } from '@nestjs/common';
import type { GetPluginCollectionCommand } from '../dto/domain/plugin-collection.types';
import {
  PluginCollectionAuthorizationDeniedError,
  PluginCollectionNotFoundError,
} from '../errors/plugin-collection.errors';
import { PluginCollectionAuditService } from '../services/plugin-collection-audit.service';
import { PluginCollectionDeclarationService } from '../services/plugin-collection-declaration.service';
import { PluginCollectionPersistenceService } from '../services/plugin-collection-persistence.service';

@Injectable()
export class DeletePluginCollectionDocumentService {
  constructor(
    private readonly declarations: PluginCollectionDeclarationService,
    private readonly persistence: PluginCollectionPersistenceService,
    private readonly audit: PluginCollectionAuditService
  ) {}

  async run(command: GetPluginCollectionCommand): Promise<void> {
    const resolved = await this.declarations.resolve(command.collectionName, command.context);
    try {
      await this.persistence.delete(resolved, command);
    } catch (error) {
      if (!(error instanceof PluginCollectionAuthorizationDeniedError)) throw error;
      await this.audit.record(command.context, {
        collectionName: command.collectionName,
        documentId: command.documentId,
        parentType: resolved.declaration.entityBinding?.type,
        action: 'DELETE',
        outcome: 'AUTHORIZATION_DENIED',
      });
      throw new PluginCollectionNotFoundError();
    }
  }
}
