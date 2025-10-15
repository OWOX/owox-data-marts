import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Button } from '@owox/ui/components/button';
import { Code, Plug, Table, Box } from 'lucide-react';
import { DataMartPlusIcon } from '../../../../../../shared';

export function EmptyDataMartsState() {
  const { scope } = useProjectRoute();

  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const defaultTitle = 'Create your first Data Mart';
  const defaultDescription = 'Data Marts help you organize and analyze your data effectively.';
  const defaultIcon = (
    <DataMartPlusIcon className='h-16 w-16 text-neutral-400 dark:text-neutral-300' />
  );

  interface Option {
    key: string;
    title: string;
    icon: React.ReactNode;
    badge?: string;
    hoverTitle?: string;
    hoverDescription?: string;
    hoverIcon?: React.ReactNode;
  }

  const options: Option[] = [
    {
      key: 'sql',
      title: 'SQL Query',
      icon: <Code className='text-muted-foreground' />,
      hoverIcon: (
        <Code className='h-16 w-16 text-neutral-400 dark:text-neutral-300' strokeWidth={1} />
      ),
      hoverTitle: 'Start with a SQL Query',
      hoverDescription: 'Build a Data Mart directly from a SQL query.',
    },
    {
      key: 'connector',
      title: 'Connector',
      icon: <Plug className='text-muted-foreground' />,
      hoverIcon: (
        <Plug className='h-16 w-16 text-neutral-400 dark:text-neutral-300' strokeWidth={1} />
      ),
      hoverTitle: 'Connect to Sources',
      hoverDescription: 'Import data from connectors like Facebook, LinkedIn, TikTok, etc.',
      badge: 'Popular',
    },
    {
      key: 'table',
      title: 'Existing Table',
      icon: <Table className='text-muted-foreground' />,
      hoverIcon: (
        <Table className='h-16 w-16 text-neutral-400 dark:text-neutral-300' strokeWidth={1} />
      ),
      hoverTitle: 'Use Existing Table',
      hoverDescription: 'Create a Data Mart from an existing table in your storage.',
    },
    {
      key: 'blank',
      title: 'Blank Data Mart',
      icon: <Box className='text-muted-foreground' />,
      hoverIcon: defaultIcon,
      hoverTitle: 'Start with Blank',
      hoverDescription: 'Create a blank Data Mart and define everything manually.',
    },
  ];

  const currentOption = options.find(o => o.key === hoveredOption) ?? null;

  return (
    <div className='dm-empty-state'>
      <span className='mb-6 transition-opacity duration-300' key={currentOption?.key ?? 'default'}>
        {currentOption?.hoverIcon ?? defaultIcon}
      </span>
      <h2
        className='dm-empty-state-title transition-opacity duration-300'
        key={`title-${currentOption?.key ?? 'default'}`}
      >
        {currentOption?.hoverTitle ?? defaultTitle}
      </h2>
      <p
        className='dm-empty-state-subtitle transition-opacity duration-300'
        key={`desc-${currentOption?.key ?? 'default'}`}
      >
        {currentOption?.hoverDescription ?? defaultDescription}
      </p>

      <div className='mt-2 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-4'>
        {options.map(option => (
          <Link key={option.key} to={scope(`/data-marts/create?type=${option.key}`)}>
            <Button
              variant='outline'
              className='relative flex h-full w-full flex-col items-start justify-center gap-2 px-4 py-3 transition-all duration-200 ease-in-out hover:shadow-sm'
              onMouseEnter={() => {
                setHoveredOption(option.key);
              }}
              onMouseLeave={() => {
                setHoveredOption(null);
              }}
            >
              {/* Badge */}
              {option.badge && (
                <span className='bg-primary absolute top-0 right-0 rounded-tr-md rounded-bl-md px-2 py-0.5 text-[10px] font-medium text-white shadow-sm'>
                  {option.badge}
                </span>
              )}

              <span className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-white/8 dark:group-hover:bg-white/10'>
                {option.icon}
              </span>
              <span className='text-center font-medium'>{option.title}</span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
