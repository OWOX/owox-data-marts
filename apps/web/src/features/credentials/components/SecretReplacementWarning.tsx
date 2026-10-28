import type { Credential } from '../types';

export function SecretReplacementWarning({ credential }: { credential: Credential }) {
  const count = new Set(
    credential.usedBy.filter(item => item.consumerType === 'storage').map(item => item.consumerId)
  ).size;
  if (count === 0) return null;
  return (
    <p className='text-warning text-sm' role='status'>
      {count === 1
        ? 'The new secret applies to 1 Storage that uses this Credential.'
        : `The new secret applies to ${String(count)} Storages that use this Credential.`}
    </p>
  );
}
