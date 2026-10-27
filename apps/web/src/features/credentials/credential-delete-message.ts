import type { CredentialConsumerReference } from './types';

const counted = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** Why a Credential cannot be deleted yet, and what frees it: a Storage or Destination switches, a plugin is uninstalled. */
export function credentialDeleteBlockedMessage(usedBy: CredentialConsumerReference[]): string {
  // A plugin installation binds once per requirement, so consumers are counted by id.
  const count = (type: string) =>
    new Set(usedBy.filter(item => item.consumerType === type).map(item => item.consumerId)).size;
  const storages = count('storage');
  const destinations = count('destination');
  const plugins = count('plugin-installation');
  const all = new Set(usedBy.map(item => `${item.consumerType}:${item.consumerId}`)).size;
  if (all > storages + destinations + plugins) {
    return `It is still used by ${counted(all, 'consumer', 'consumers')}. Remove it from ${all === 1 ? 'that consumer' : 'those consumers'} first.`;
  }
  const switching = [
    storages > 0 ? counted(storages, 'Storage', 'Storages') : null,
    destinations > 0 ? counted(destinations, 'Destination', 'Destinations') : null,
  ].filter((part): part is string => part !== null);
  const switchingCount = storages + destinations;
  const switchingNames = [
    storages > 0 ? (storages === 1 ? 'Storage' : 'Storages') : null,
    destinations > 0 ? (destinations === 1 ? 'Destination' : 'Destinations') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' and ');
  const pluginsText = counted(plugins, 'plugin', 'plugins');
  if (switchingCount > 0 && plugins > 0) {
    return (
      `It is still used by ${switching.join(', ')} and ${pluginsText}. ` +
      `Switch the ${switchingNames} to another Credential and uninstall the ${plugins === 1 ? 'plugin' : 'plugins'} first.`
    );
  }
  if (switchingCount > 0) {
    return `It is still used by ${switching.join(' and ')}. Switch ${switchingCount === 1 ? 'it' : 'them'} to another Credential first.`;
  }
  return `It is still used by ${pluginsText}. Uninstall ${plugins === 1 ? 'it' : 'them'} first.`;
}
