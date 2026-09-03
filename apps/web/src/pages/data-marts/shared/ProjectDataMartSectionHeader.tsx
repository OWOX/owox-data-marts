import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useProjectRoute } from '../../../shared/hooks';

interface ProjectDataMartSectionHeaderProps {
  title: string;
  /** Rendered right after the `<h1>{title}</h1>` — e.g. the Models page's storage picker. */
  titleAfter?: ReactNode;
  /** Rendered at the row end, alongside the breadcrumb. */
  actions?: ReactNode;
}

/**
 * Standard header for pages nested under Data Marts (Reports, Triggers, Run History,
 * Insights, Models): renders a "Data Marts > {title}" breadcrumb, with "Data Marts"
 * linking back to the list page.
 */
export function ProjectDataMartSectionHeader({
  title,
  titleAfter,
  actions,
}: ProjectDataMartSectionHeaderProps) {
  const { scope } = useProjectRoute();

  return (
    <header className='dm-page-header'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='dm-page-header-title flex items-center gap-1.5'>
          <Link
            to={scope('/data-marts')}
            className='text-muted-foreground/75 hover:text-foreground transition-colors'
          >
            Data Marts
          </Link>
          <ChevronRight className='text-muted-foreground mt-1 size-4' aria-hidden='true' />
          <h1 className='inline'>{title}</h1>
          {titleAfter}
        </div>
        {actions}
      </div>
    </header>
  );
}
