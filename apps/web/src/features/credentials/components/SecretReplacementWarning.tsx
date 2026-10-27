import type { Credential } from '../types';

const countOf = (credential: Credential, type: string) =>
  new Set(credential.usedBy.filter(item => item.consumerType === type).map(item => item.consumerId))
    .size;

export function SecretReplacementWarning({ credential }: { credential: Credential }) {
  const storages = countOf(credential, 'storage');
  const destinations = countOf(credential, 'destination');
  if (storages + destinations === 0) return null;
  const parts = [
    storages > 0 ? `${String(storages)} ${storages === 1 ? 'Storage' : 'Storages'}` : null,
    destinations > 0
      ? `${String(destinations)} ${destinations === 1 ? 'Destination' : 'Destinations'}`
      : null,
  ].filter(Boolean);
  return (
    <p className='text-warning text-sm' role='status'>
      {`The new secret applies to ${parts.join(' and ')} that ${storages + destinations === 1 ? 'uses' : 'use'} this Credential.`}
    </p>
  );
}
