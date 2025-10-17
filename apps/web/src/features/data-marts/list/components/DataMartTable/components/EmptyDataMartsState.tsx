import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Button } from '@owox/ui/components/button';
import {
  DataMartPlusIcon,
  XAdsIcon,
  FacebookAdsIcon,
  LinkedInAdsIcon,
} from '../../../../../../shared';
import { Code, Plug, Box, GraduationCap, TvMinimalPlay } from 'lucide-react';

export function EmptyDataMartsState() {
  const { scope } = useProjectRoute();

  return (
    <div className='flex flex-col items-center justify-between gap-12 overflow-hidden px-8 py-16 lg:flex-row-reverse lg:px-16 lg:py-24'>
      {/* Right side (Icon) */}
      <div className='relative flex w-full justify-center lg:w-1/2'>
        <div className='absolute inset-0 flex items-center justify-center'>
          {[1, 2, 3, 4, 5].map(i => {
            const size = `${(16 * i + 24).toString()}vmin`;
            return (
              <div
                key={i}
                className='animate-ring-pulse'
                style={{
                  height: size,
                  width: size,
                  animationDelay: `${(i * 0.3).toString()}s`,
                  opacity: 0.2 + i * 0.1,
                }}
              />
            );
          })}
        </div>

        {/* Soft glow behind the icon */}
        <div className='animate-glow-pulse' />

        {/* Icon */}
        <DataMartPlusIcon
          className='animate-icon-pulse'
          aria-label='Data Mart creation illustration'
        />
      </div>

      {/* Left side (Content) */}
      <div className='w-full space-y-8 lg:w-1/2'>
        <div>
          <h2 className='mb-6 text-4xl font-semibold lg:text-5xl'>Create Your First Data Mart</h2>
          <p className='text-muted-foreground text-lg'>
            Get started your way — connect a data source, write an SQL query, or explore with a
            blank setup.
          </p>
        </div>

        {/* Connector-based section */}
        <div className='border-border border-b pt-2 pb-10'>
          <h3 className='mb-4 text-xl font-medium'>Connect a data source</h3>
          <div className='flex flex-wrap items-center gap-4'>
            <Link to={scope('/data-marts/create?mode=facebook-ads')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <FacebookAdsIcon className='h-4 w-4' />
                Facebook Ads
              </Button>
            </Link>
            <Link to={scope('/data-marts/create?mode=x-ads')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <XAdsIcon className='h-4 w-4' />X Ads
              </Button>
            </Link>
            <Link to={scope('/data-marts/create?mode=linkedin-ads')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <LinkedInAdsIcon className='h-4 w-4' />
                LinkedIn Ads
              </Button>
            </Link>
            <Link to={scope('/data-marts/create?mode=connector')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <Plug className='h-4 w-4' />
                Other connector
              </Button>
            </Link>
          </div>
        </div>

        {/* SQL-based and Blank */}
        <div className='border-border border-b pb-10'>
          <h3 className='mb-4 text-xl font-medium'>Build using SQL or start blank</h3>
          <div className='flex flex-wrap items-center gap-4'>
            <Link to={scope('/data-marts/create?mode=sql')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <Code className='h-4 w-4' />
                Start with SQL query
              </Button>
            </Link>
            <span className='text-muted-foreground text-sm'>or</span>
            <Link to={scope('/data-marts/create?mode=blank')}>
              <Button variant='outline' className='flex items-center gap-2' size='lg'>
                <Box className='h-4 w-4' />
                Create blank Data Mart
              </Button>
            </Link>
          </div>
        </div>

        {/* Help */}
        <div>
          <div className='flex flex-wrap items-center gap-4'>
            <Button asChild variant='ghost' size='sm'>
              <Link
                className='text-muted-foreground flex flex-wrap items-center gap-2 font-medium'
                to='https://www.youtube.com/playlist?list=PLvcNVLV5BVbHHCekyAZBEIVnlC4i1qcHx'
                target='_blank'
              >
                <TvMinimalPlay className='h-4 w-4' />
                Watch a 2-minute demo
              </Link>
            </Button>
            <Button asChild variant='ghost' size='sm'>
              <Link
                className='text-muted-foreground flex flex-wrap items-center gap-2'
                to='https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/'
                target='_blank'
              >
                <GraduationCap className='h-4 w-4' />
                Learn more
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
