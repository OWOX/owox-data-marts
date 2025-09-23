import { Button } from '@owox/ui/components/button';
import { Link } from 'react-router-dom';
import { Telescope, ChevronRight } from 'lucide-react';

function NotFound() {
  return (
    <div className='dm-empty-state-404page'>
      {/* Foreground card */}
      <div className='dm-empty-state-404page-foreground'>
        <Telescope className='dm-empty-state-ico' strokeWidth={1} />

        <h1 className='dm-empty-state-title'>Lost in the 404th Data Realm</h1>

        <p className='dm-empty-state-subtitle'>
          In this dimension, <code>1+1=3</code>, percentages exceed 100%, and dashboards predict{' '}
          <i>yesterday</i>.<br />
          Escape while you can!
        </p>

        <Button variant='default' asChild>
          <Link to={'/'} className='flex items-center gap-1' aria-label='Guide Me Home'>
            Guide Me Home
            <ChevronRight className='h-4 w-4' />
          </Link>
        </Button>
      </div>

      {/* Tunnel background */}
      <div className='dm-empty-state-404page-background' />
    </div>
  );
}

export default NotFound;
