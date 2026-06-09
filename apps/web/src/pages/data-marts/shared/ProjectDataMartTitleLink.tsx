import { Link } from 'react-router-dom';

interface ProjectDataMartTitleLinkProps {
  title: string;
  to: string;
}

export function ProjectDataMartTitleLink({ title, to }: ProjectDataMartTitleLinkProps) {
  return (
    <Link
      to={to}
      onClick={event => {
        event.stopPropagation();
      }}
      className='text-foreground hover:text-primary block w-full [overflow-wrap:anywhere] break-words whitespace-normal transition-colors'
    >
      {title}
    </Link>
  );
}
