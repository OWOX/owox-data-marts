import { Injectable } from '@nestjs/common';
import type {
  ListPluginCollectionCommand,
  PluginCollectionPageDto,
} from '../dto/domain/plugin-collection.types';
import { PluginCollectionDeclarationService } from '../services/plugin-collection-declaration.service';
import { PluginCollectionPersistenceService } from '../services/plugin-collection-persistence.service';

@Injectable()
export class ListPluginCollectionDocumentsService {
  constructor(
    private readonly declarations: PluginCollectionDeclarationService,
    private readonly persistence: PluginCollectionPersistenceService
  ) {}

  async run(command: ListPluginCollectionCommand): Promise<PluginCollectionPageDto> {
    const resolved = await this.declarations.resolve(command.collectionName, command.context);
    return this.persistence.list(resolved, command);
  }
}
