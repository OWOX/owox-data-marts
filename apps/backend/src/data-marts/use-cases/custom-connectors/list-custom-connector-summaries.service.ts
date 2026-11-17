import { Injectable, Logger } from '@nestjs/common';
import type { ListCustomConnectorSummariesCommand } from '../../dto/domain/list-custom-connector-summaries.command';
import type { CustomConnectorSummaryDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';
import { customConnectorKeyModel } from '../../connector-types/custom-connector-key-model';

@Injectable()
export class ListCustomConnectorSummariesService {
  private readonly logger = new Logger(ListCustomConnectorSummariesService.name);

  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: ListCustomConnectorSummariesCommand): Promise<CustomConnectorSummaryDto[]> {
    const wanted = new Set((command.names ?? []).map(n => n.trim().toLowerCase()).filter(Boolean));
    const defs = (await this.definitions.listByProject(command.projectId)).filter(
      def => wanted.size === 0 || wanted.has(def.name.toLowerCase())
    );
    const manifests = await this.definitions.getActiveManifestsByDefId(defs);
    return defs.map(def =>
      this.mapper.toSummaryDto(def, this.hostsOf(def.id, manifests.get(def.id)))
    );
  }

  // A manifest the current parser refuses must not fail the whole list.
  private hostsOf(defId: string, manifest?: Record<string, unknown>): string[] {
    if (!manifest) return [];
    try {
      return customConnectorKeyModel(manifest).allowedHosts;
    } catch {
      this.logger.warn(
        `Parser refused the active manifest of connector definition ${defId}; hosts are empty`
      );
      return [];
    }
  }
}
