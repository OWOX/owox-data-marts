import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ListStorageResourcesCommand,
  StorageResourceLevel,
} from '../dto/domain/list-storage-resources.command';
import { ListStorageResourcesResponseDto } from '../dto/presentation/storage-resources/list-storage-resources-response.dto';
import { DataStorageService } from '../services/data-storage.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { StorageResourceBrowserFacade } from '../data-storage-types/facades/storage-resource-browser.facade';

@Injectable()
export class ListStorageResourcesService {
  private readonly logger = new Logger(ListStorageResourcesService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly browserFacade: StorageResourceBrowserFacade
  ) {}

  async run(command: ListStorageResourcesCommand): Promise<ListStorageResourcesResponseDto> {
    const storage = await this.dataStorageService.getByProjectIdAndId(
      command.projectIdContext,
      command.storageId
    );

    if (command.userId) {
      const allowed = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.storageId,
        Action.USE,
        command.projectIdContext
      );
      if (!allowed) {
        throw new ForbiddenException('You do not have access to this Storage');
      }
    }

    try {
      const browser = await this.browserFacade.create(storage);

      switch (command.level) {
        case StorageResourceLevel.NAMESPACES: {
          const namespaces = await browser.listNamespaces();
          return { namespaces };
        }
        case StorageResourceLevel.RESOURCES: {
          if (!command.namespaceId) {
            throw new BadRequestException('namespaceId is required for level=resources');
          }
          const resources = await browser.listLeafResources(
            command.namespaceId,
            command.resourceType
          );
          return { resources };
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Storage resource listing failed for storage ${command.storageId}: ${message}`
      );

      if (error instanceof Error && error.message.startsWith('Timed out after')) {
        throw new ServiceUnavailableException('Storage API timed out. Please try again later.');
      }

      throw new BadGatewayException(`Failed to list storage resources: ${message}`);
    }
  }
}
