import RelativeTime from '@owox/ui/components/common/relative-time';
import { FormItem } from '@owox/ui/components/form';
import { cn } from '@owox/ui/lib/utils';
import { ArchiveRestore, DatabaseIcon, Puzzle } from 'lucide-react';
import { Link } from 'react-router';
import { useProjectRoute } from '../../../shared/hooks';
import type { Credential, CredentialConsumerReference } from '../types';

// Storages and Destinations are pages the member can open; any other consumer is a plugin.
const LINKED_CONSUMERS: Partial<
  Record<string, { Icon: typeof DatabaseIcon; kind: string; path: string }>
> = {
  storage: { Icon: DatabaseIcon, kind: 'Storage', path: 'data-storages' },
  destination: { Icon: ArchiveRestore, kind: 'Destination', path: 'data-destinations' },
};

function ConsumerRow({ consumer }: { consumer: CredentialConsumerReference }) {
  const { scope } = useProjectRoute();
  const { title } = consumer;
  const linked = LINKED_CONSUMERS[consumer.consumerType];
  const Icon = linked?.Icon ?? Puzzle;
  const kind = linked?.kind ?? 'Plugin';

  return (
    <li className='flex items-start gap-3 py-2.5 first:pt-0 last:pb-0'>
      <Icon className='text-muted-foreground mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <div className='flex min-w-0 flex-col gap-0.5'>
        {!linked ? (
          <span
            className={
              typeof title === 'string' ? 'truncate font-medium' : 'text-muted-foreground truncate'
            }
            title={consumer.requirementKey}
          >
            {typeof title === 'string' ? title || 'Untitled plugin' : 'A plugin you cannot access'}
          </span>
        ) : typeof title === 'string' ? (
          <Link
            to={scope(`/${linked.path}?id=${consumer.consumerId}`)}
            className='truncate font-medium hover:underline'
            title={title || undefined}
          >
            {title || `Untitled ${kind}`}
          </Link>
        ) : (
          <span className='text-muted-foreground truncate'>A {kind} you cannot access</span>
        )}
        <span className='text-muted-foreground text-xs'>
          {kind} ·{' '}
          {consumer.lastUsedAt ? (
            <>
              Last used: <RelativeTime date={new Date(consumer.lastUsedAt)} />
            </>
          ) : (
            'Never used'
          )}
        </span>
      </div>
    </li>
  );
}

/** The consumers of a Credential, one row each. */
export function CredentialConsumerList({
  consumers,
  className,
}: {
  consumers: readonly CredentialConsumerReference[];
  className?: string;
}) {
  return (
    <ul aria-label='Used by' className={cn('divide-y text-sm', className)}>
      {consumers.map(consumer => (
        <ConsumerRow
          key={`${consumer.consumerType}:${consumer.consumerId}:${consumer.requirementKey}`}
          consumer={consumer}
        />
      ))}
    </ul>
  );
}

export function CredentialUsedByList({
  credential,
  inSection = false,
}: {
  credential: Credential;
  /** In a form section titled Used by: a card with no heading of its own. */
  inSection?: boolean;
}) {
  if (inSection) {
    return (
      <FormItem>
        <CredentialConsumerList consumers={credential.usedBy} />
      </FormItem>
    );
  }
  return (
    <div className='bg-muted/50 rounded-md border p-3'>
      <div className='mb-2 text-sm font-medium'>Used by</div>
      {/* A dialog does not scroll, so a long list scrolls on its own; the form section scrolls with its sheet. */}
      <CredentialConsumerList consumers={credential.usedBy} className='max-h-48 overflow-y-auto' />
    </div>
  );
}
