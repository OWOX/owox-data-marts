import type { PluginGalleryEntry } from './types';

// Case-insensitive, digit-aware ordering so "Plugin 2" precedes "Plugin 10".
const pluginNameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Orders plugins by name. Plugins that share a name fall back to their id, so the order
 * never depends on the order the list arrived in.
 */
export function comparePluginsByName(
  a: Pick<PluginGalleryEntry, 'displayName' | 'pluginId'>,
  b: Pick<PluginGalleryEntry, 'displayName' | 'pluginId'>
): number {
  return (
    pluginNameCollator.compare(a.displayName, b.displayName) || a.pluginId.localeCompare(b.pluginId)
  );
}
