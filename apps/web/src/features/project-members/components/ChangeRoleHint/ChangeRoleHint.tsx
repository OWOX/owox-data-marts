import { Link, type LinkProps } from 'react-router';
import { AdminsHoverCard } from '../AdminsHoverCard';

export function ChangeRoleHint({ to, relative }: Pick<LinkProps, 'to' | 'relative'>) {
  return (
    <>
      <AdminsHoverCard>
        <span tabIndex={0} className='cursor-help underline decoration-dotted underline-offset-2'>
          A Project Admin
        </span>
      </AdminsHoverCard>{' '}
      can change your role in{' '}
      <Link
        to={to}
        relative={relative}
        className='hover:text-foreground underline decoration-dotted underline-offset-2'
      >
        Project settings → Members
      </Link>
      .
    </>
  );
}
