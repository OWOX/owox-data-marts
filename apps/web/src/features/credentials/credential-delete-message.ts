import type { CredentialConsumerReference } from './types';

const counted = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** Why a Credential cannot be deleted yet, and what frees it: a Storage switches, a plugin is uninstalled. */
export function credentialDeleteBlockedMessage(usedBy: CredentialConsumerReference[]): string {
  // A plugin installation binds once per requirement, so consumers are counted by id.
  const count = (type: string) =>
    new Set(usedBy.filter(item => item.consumerType === type).map(item => item.consumerId)).size;
  const storages = count('storage');
  const plugins = count('plugin-installation');
  const all = new Set(usedBy.map(item => `${item.consumerType}:${item.consumerId}`)).size;
  if (all > storages + plugins) {
    return `It is still used by ${counted(all, 'consumer', 'consumers')}. Remove it from ${all === 1 ? 'that consumer' : 'those consumers'} first.`;
  }
  if (storages > 0 && plugins > 0) {
    return (
      `It is still used by ${counted(storages, 'Storage', 'Storages')} and ${counted(plugins, 'plugin', 'plugins')}. ` +
      `Switch the ${storages === 1 ? 'Storage' : 'Storages'} to another Credential and uninstall the ${plugins === 1 ? 'plugin' : 'plugins'} first.`
    );
  }
  if (storages > 0) {
    return `It is still used by ${counted(storages, 'Storage', 'Storages')}. Switch ${storages === 1 ? 'it' : 'them'} to another Credential first.`;
  }
  return `It is still used by ${counted(plugins, 'plugin', 'plugins')}. Uninstall ${plugins === 1 ? 'it' : 'them'} first.`;
}
