import { Badge } from '@owox/ui/components/badge';

interface ContextBadgeData {
  id: string;
  name: string;
}

export function ContextBadges({ contexts }: { contexts?: ContextBadgeData[] }) {
  if (!contexts || contexts.length === 0) return null;

  return (
    <div className='flex flex-wrap gap-1'>
      {contexts.map(ctx => (
        <Badge key={ctx.id} variant='secondary' className='text-xs'>
          {ctx.name}
        </Badge>
      ))}
    </div>
  );
}
