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
    <div className='flex flex-col items-center justify-between gap-12 px-8 py-16 lg:flex-row-reverse lg:px-16 lg:py-24'>
      {/* Right side (Icon) */}
      <div className='relative flex w-full justify-center lg:w-1/2'>
        {/* Neutral animated concentric rings */}
        <div className='absolute inset-0 flex items-center justify-center'>
          {/* Outer ring */}
          <div className='animate-slow-pulse absolute h-[26rem] w-[26rem] rounded-full border border-neutral-400/30 dark:border-neutral-500/20' />
          {/* Mid ring */}
          <div className='animate-slow-spin absolute h-[22rem] w-[22rem] rounded-full border border-neutral-400/30 dark:border-neutral-500/20' />
          {/* Inner ring */}
          <div className='animate-slow-pulse absolute h-[18rem] w-[18rem] rounded-full border border-neutral-400/30 dark:border-neutral-500/20' />
          {/* Core ring */}
          <div className='animate-slow-spin-reverse absolute h-[14rem] w-[14rem] rounded-full border border-neutral-400/30 dark:border-neutral-500/20' />
        </div>

        {/* Central icon */}
        <DataMartPlusIcon className='relative h-64 w-64 text-neutral-400 dark:text-neutral-200' />
      </div>

      {/* Left side (Content) */}
      <div className='w-full space-y-8 lg:w-1/2'>
        <div>
          <h2 className='mb-3 text-4xl font-semibold lg:text-5xl'>Create Your First Data Mart</h2>
          <p className='text-muted-foreground text-lg'>
            Get started your way — connect a data source, write an SQL query, or explore with a
            blank setup.
          </p>
        </div>

        {/* Connector-based section */}
        <div className='border-border border-b pt-2 pb-10'>
          <h3 className='mb-4 text-xl font-medium'>Connect a data source</h3>
          <div className='flex flex-wrap items-center gap-4'>
            <Button variant='outline' className='flex items-center gap-2' size='lg'>
              <FacebookAdsIcon className='h-4 w-4' />
              Facebook Ads
            </Button>
            <Button variant='outline' className='flex items-center gap-2' size='lg'>
              <XAdsIcon className='h-4 w-4' />X Ads
            </Button>
            <Button variant='outline' className='flex items-center gap-2' size='lg'>
              <LinkedInAdsIcon className='h-4 w-4' />
              LinkedIn Ads
            </Button>
            <Button variant='outline' className='flex items-center gap-2' size='lg'>
              <Plug className='h-4 w-4' />
              Other connector
            </Button>
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
