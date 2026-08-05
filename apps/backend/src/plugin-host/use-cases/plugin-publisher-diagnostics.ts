import { PluginPublisherDiagnosticsDto } from '../dto/domain/plugin-publication.dto';
import { SyncReport } from '../dto/domain/plugin-sync.dto';
import { PluginVersion } from '../entities/plugin-version.entity';
import { Plugin } from '../entities/plugin.entity';

/** Builds the management-only diagnostics block from the plugin record and current version. */
export function buildPublisherDiagnostics(
  plugin: Plugin | null | undefined,
  version: PluginVersion | null | undefined,
  report?: SyncReport | null
): PluginPublisherDiagnosticsDto {
  const source = report ?? plugin?.lastSyncReport ?? null;

  return {
    deliveryUrl: version?.deliveryUrl ?? null,
    commitSha: version?.commitSha ?? null,
    accessMode: source?.accessMode ?? null,
    syncedAt: source?.syncedAt ?? null,
    acceptedSemvers: source?.acceptedSemvers ?? [],
    unchangedSemvers: source?.unchangedSemvers ?? [],
    rejections: source?.rejections ?? [],
  };
}
