import type { Credential } from '../types';

const countOf = (credential: Credential, type: string) =>
  new Set(credential.usedBy.filter(item => item.consumerType === type).map(item => item.consumerId))
    .size;

const counted = (count: number, one: string, many: string) =>
  count > 0 ? `${String(count)} ${count === 1 ? one : many}` : null;

export function SecretReplacementWarning({ credential }: { credential: Credential }) {
  const storages = countOf(credential, 'storage');
  const destinations = countOf(credential, 'destination');
  const dataMarts = countOf(credential, 'connector-config');
  const total = storages + destinations + dataMarts;
  if (total === 0) return null;
  const parts = [
    counted(storages, 'Storage', 'Storages'),
    counted(destinations, 'Destination', 'Destinations'),
    counted(dataMarts, 'Data Mart', 'Data Marts'),
  ].filter((part): part is string => part !== null);
  const last = parts.pop();
  const list = parts.length > 0 ? `${parts.join(', ')} and ${String(last)}` : String(last);
  return (
    <p className='text-warning text-sm' role='status'>
      {`The new secret applies to ${list} that ${total === 1 ? 'uses' : 'use'} this Credential.`}
    </p>
  );
}
