import { Link } from 'react-router';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

interface ProjectDataMartTitleLinkProps {
  title: string;
  to: string;
}

export function ProjectDataMartTitleLink({ title, to }: ProjectDataMartTitleLinkProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            onClick={event => {
              event.stopPropagation();
            }}
            className='text-foreground hover:text-primary block w-full truncate transition-colors'
          >
            {title}
          </Link>
        </TooltipTrigger>

        <TooltipContent side='bottom' align='start'>
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
