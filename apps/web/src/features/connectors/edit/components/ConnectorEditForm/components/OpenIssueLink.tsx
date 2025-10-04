import { Button } from '@owox/ui/components/button';
import { ExternalLinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface OpenIssueLinkProps {
  label: string;
}

export function OpenIssueLink({ label }: OpenIssueLinkProps) {
  return (
    <div className='border-border text-muted-foreground mt-3 flex items-center justify-center gap-2 border-t pt-3 text-sm'>
      <Button variant='outline' asChild>
        <Link
          to='https://github.com/OWOX/owox-data-marts/issues'
          target='_blank'
          rel='noopener noreferrer'
        >
          {label} Open issue here
          <ExternalLinkIcon className='h-4 w-4' />
        </Link>
      </Button>
    </div>
  );
}
