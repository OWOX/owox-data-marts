import { Button } from '@owox/ui/components/button';
import { Link } from 'react-router-dom';
import { ShieldAlert, ChevronRight } from 'lucide-react';

function NoAccess() {
  return (
    <div className='dm-empty-state-404page'>
      <div className='dm-empty-state-404page-foreground'>
        <ShieldAlert className='dm-empty-state-ico' strokeWidth={1} />

        <h1 className='dm-empty-state-title'>You don't have access</h1>

        <p className='dm-empty-state-subtitle'>
          This resource exists but you don't have permission to view it.
          <br />
          Contact your project admin or the resource owner to request access.
        </p>

        <Button variant='default' asChild>
          <Link to={'/'} className='flex items-center gap-1' aria-label='Go to Dashboard'>
            Go to Dashboard
            <ChevronRight className='h-4 w-4' />
          </Link>
        </Button>
      </div>

      <div className='dm-empty-state-404page-background' />
    </div>
  );
}

export default NoAccess;
