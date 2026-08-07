import { Injectable } from '@nestjs/common';
import type {
  PluginCollectionDocumentDto,
  PutPluginCollectionCommand,
} from '../dto/domain/plugin-collection.types';
import {
  PluginCollectionAuthorizationDeniedError,
  PluginCollectionQuotaExceededError,
  PluginCollectionValidationError,
} from '../errors/plugin-collection.errors';
import { PluginCollectionAuditService } from '../services/plugin-collection-audit.service';
import { PluginCollectionDeclarationService } from '../services/plugin-collection-declaration.service';
import { PluginCollectionPersistenceService } from '../services/plugin-collection-persistence.service';

@Injectable()
export class PutPluginCollectionDocumentService {
  constructor(
    private readonly declarations: PluginCollectionDeclarationService,
    private readonly persistence: PluginCollectionPersistenceService,
    private readonly audit: PluginCollectionAuditService
  ) {}

  async run(command: PutPluginCollectionCommand): Promise<PluginCollectionDocumentDto> {
    const resolved = await this.declarations.resolve(command.collectionName, command.context);
    try {
      return await this.persistence.put(resolved, command);
    } catch (error) {
      const outcome =
        error instanceof PluginCollectionAuthorizationDeniedError
          ? 'AUTHORIZATION_DENIED'
          : error instanceof PluginCollectionQuotaExceededError
            ? 'QUOTA_EXCEEDED'
            : error instanceof PluginCollectionValidationError
              ? 'VALIDATION_FAILED'
              : null;
      if (outcome) {
        await this.audit.record(command.context, {
          collectionName: command.collectionName,
          documentId: command.documentId,
          parentType: resolved.declaration.entityBinding?.type,
          parentId: command.parentId,
          action: 'PUT',
          outcome,
        });
      }
      throw error;
    }
  }
}
