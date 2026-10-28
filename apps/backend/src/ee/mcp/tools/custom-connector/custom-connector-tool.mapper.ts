import type {
  McpCustomConnector,
  McpCustomConnectorCreated,
  McpCustomConnectorDetail,
  McpCustomConnectorPublished,
  McpCustomConnectorActivated,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';

export class CustomConnectorToolMapper {
  toCreated(connector: McpCustomConnectorCreated) {
    return { connector_id: connector.id, name: connector.name, title: connector.title };
  }

  toListItem(connector: McpCustomConnector) {
    return {
      ...this.toCreated(connector),
      description: connector.description,
      doc_url: connector.docUrl,
      active_version_id: connector.activeVersionId,
      active_version: connector.activeVersion,
    };
  }

  toDetail(connector: McpCustomConnectorDetail) {
    return {
      ...this.toListItem(connector),
      versions: connector.versions.map(version => ({
        version: version.version,
        status: version.status,
        published_at: version.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  toPublished(version: McpCustomConnectorPublished) {
    return {
      version: version.version,
      status: version.status,
      published_at: version.publishedAt?.toISOString() ?? null,
      warnings: version.warnings,
    };
  }

  toActivated(connector: McpCustomConnectorActivated) {
    return {
      active_version_id: connector.activeVersionId,
      active_version: connector.activeVersion,
    };
  }
}
