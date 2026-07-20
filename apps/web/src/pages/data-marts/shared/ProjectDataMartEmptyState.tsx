import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, FileText, History, Bookmark } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { useProjectRoute } from '../../../shared/hooks';

type ProjectDataMartEmptyStateVariant = 'triggers' | 'reports' | 'insights' | 'runs';

const EMPTY_STATE_COPY = {
  triggers: {
    icon: CalendarClock,
    title: 'No triggers yet',
    description:
      'Triggers created inside Data Marts will appear here with their schedule, run target, and status.',
  },
  reports: {
    icon: FileText,
    title: 'No reports yet',
    description:
      'Reports configured inside Data Marts will appear here with their destination, run status, and actions.',
  },
  insights: {
    icon: Bookmark,
    title: 'No insights yet',
    description:
      'Insights created from Data Mart data will appear here with their update details and actions.',
  },
  runs: {
    icon: History,
    title: 'No runs yet',
    description: 'Data Mart runs will appear here as they start and finish across the project.',
  },
} satisfies Record<
  ProjectDataMartEmptyStateVariant,
  {
    icon: typeof CalendarClock;
    title: string;
    description: string;
  }
>;

interface ProjectDataMartEmptyStateProps {
  variant: ProjectDataMartEmptyStateVariant;
}

export function ProjectDataMartEmptyState({ variant }: ProjectDataMartEmptyStateProps) {
  const { scope } = useProjectRoute();
  const copy = EMPTY_STATE_COPY[variant];
  const Icon = copy.icon;

  return (
    <div className='dm-empty-state' data-testid={`project-${variant}-empty-state`}>
      <Icon className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>{copy.title}</h2>
      <p className='dm-empty-state-subtitle'>{copy.description}</p>
      <Button variant='outline' asChild>
        <Link to={scope('/data-marts')}>
          <ArrowRight className='h-4 w-4' />
          Choose a Data Mart
        </Link>
      </Button>
    </div>
  );
}
