import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ListStorageResourcesCommand,
  StorageResourceLevel,
} from '../dto/domain/list-storage-resources.command';
import { ListStorageResourcesResponseDto } from '../dto/presentation/storage-resources/list-storage-resources-response.dto';
import { DataStorageService } from '../services/data-storage.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { StorageResourceBrowserFacade } from '../data-storage-types/facades/storage-resource-browser.facade';

/**
 * Extracts an HTTP status code from GCP SDK / googleapis errors.
 * Both `@google-cloud/*` packages and the googleapis REST client attach a `.code`
 * or `.status` numeric property to the thrown error object.
 */
function extractGcpHttpStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  // @google-cloud/* packages surface the HTTP status as `code`; googleapis uses `status`.
  const raw = e['code'] ?? e['status'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

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
      switch (command.level) {
        case StorageResourceLevel.NAMESPACES: {
          const namespaces = await this.browserFacade.listNamespaces(storage);
          return { namespaces };
        }
        case StorageResourceLevel.RESOURCES: {
          if (!command.namespaceId) {
            throw new BadRequestException('namespaceId is required for level=resources');
          }
          const resources = await this.browserFacade.listLeafResources(
            storage,
            command.namespaceId,
            command.resourceType
          );
          return { resources };
        }
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Storage resource listing failed for storage ${command.storageId}: ${message}`
      );

      if (error instanceof Error && error.message.startsWith('Timed out after')) {
        throw new ServiceUnavailableException('Storage API timed out. Please try again later.');
      }

      // GCP returns HTTP 401 / 403 as structured errors; surface them correctly so the client
      // gets a meaningful status code instead of 502 Bad Gateway.
      const gcpStatus = extractGcpHttpStatus(error);
      if (gcpStatus === 401) {
        throw new UnauthorizedException(
          'Storage credentials are invalid or expired. Please re-authorise the storage.'
        );
      }
      if (gcpStatus === 403) {
        throw new ForbiddenException(
          'The storage credentials do not have permission to list resources.'
        );
      }

      throw new BadGatewayException(`Failed to list storage resources: ${message}`);
    }
  }
}
