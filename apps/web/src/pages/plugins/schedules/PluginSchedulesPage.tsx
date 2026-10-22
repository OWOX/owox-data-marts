import { cn } from '@owox/ui/lib/utils';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useIsAdmin } from '../../../features/idp/hooks/useRole';
import { useProjectRoute } from '../../../shared/hooks';
import { AllSchedulesTab } from './AllSchedulesTab';
import { RunHistoryTab } from './RunHistoryTab';
import { usePluginSchedulesParams, type PluginSchedulesTab } from './usePluginSchedulesParams';

const TABS: { tab: PluginSchedulesTab; name: string }[] = [
  { tab: 'schedules', name: 'All Schedules' },
  { tab: 'runs', name: 'Run History' },
];

export default function PluginSchedulesPage() {
  const { tab, href } = usePluginSchedulesParams();
  const isAdmin = useIsAdmin();
  const { scope } = useProjectRoute();

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <div className='dm-page-header-title flex items-center gap-1.5'>
          <Link
            to={scope('/plugins')}
            className='text-muted-foreground/75 hover:text-foreground transition-colors'
          >
            Plugins
          </Link>
          <ChevronRight className='text-muted-foreground mt-1 size-4' aria-hidden='true' />
          <h1 className='inline'>Schedules</h1>
        </div>
        <p className='text-muted-foreground mt-1 text-sm'>
          Schedules that run plugin actions while the plugin is closed, and every run.
        </p>
      </header>

      <div className='dm-page-content flex flex-col gap-4'>
        <nav
          className='no-scrollbar -mb-px flex gap-2 overflow-x-auto border-b whitespace-nowrap'
          aria-label='Tabs'
        >
          {TABS.map(item => (
            // A tab link keeps the plugin and owner filters and drops the rest.
            <Link
              key={item.tab}
              to={href(item.tab)}
              aria-current={item.tab === tab ? 'page' : undefined}
              className={cn(
                'border-b-2 px-4 py-4 text-sm font-medium whitespace-nowrap',
                item.tab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-200 dark:hover:text-gray-200'
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className='dm-card'>
          {tab === 'runs' ? (
            <RunHistoryTab isAdmin={isAdmin} />
          ) : (
            <AllSchedulesTab isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </div>
  );
}
