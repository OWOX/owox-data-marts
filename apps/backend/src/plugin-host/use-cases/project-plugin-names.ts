import type { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import type { PluginVersionService } from '../services/plugin-version.service';
import type { PluginService } from '../services/plugin.service';

export const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** A deleted plugin can still have schedules, so its id may be absent from the result. */
export async function pluginNamesById(
  plugins: PluginService,
  versions: PluginVersionService,
  mapper: PluginPresentationMapper,
  pluginIds: readonly string[]
): Promise<Map<string, string>> {
  const found = await plugins.findByIds(unique(pluginIds));
  const versionById = new Map(
    (await versions.findByIds(unique(found.flatMap(plugin => plugin.currentVersionId ?? [])))).map(
      version => [version.id, version]
    )
  );
  return new Map(
    found.map(plugin => [
      plugin.id,
      mapper.displayNameOf(plugin, versionById.get(plugin.currentVersionId ?? '') ?? null),
    ])
  );
}
