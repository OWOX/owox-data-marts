import { type ReactNode } from 'react';
import { projectMembersService } from '../../services/project-members.service';
import { MembersHoverCard, type MembersHoverCardItem } from '../MembersHoverCard';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

interface AdminsHoverCardProps {
  children: ReactNode;
  maxVisible?: number;
  openDelay?: number;
  closeDelay?: number;
  side?: Side;
  align?: Align;
  contentClassName?: string;
}

/**
 * Thin specialization of MembersHoverCard that fetches project admins lazily
 * on first hover. Useful anywhere a UI says "ask your admin" — drop this
 * around the word and users get a concrete list to reach out to.
 */
export function AdminsHoverCard({ children, ...rest }: AdminsHoverCardProps) {
  return (
    <MembersHoverCard
      loader={loadAdmins}
      emptyText='No admins found'
      errorText='Could not load admins'
      {...rest}
    >
      {children}
    </MembersHoverCard>
  );
}

async function loadAdmins(): Promise<MembersHoverCardItem[]> {
  const members = await projectMembersService.getMembers();
  return members
    .filter(m => m.role === 'admin')
    .map(m => ({
      id: m.userId,
      displayName: m.displayName,
      email: m.email,
      avatarUrl: m.avatarUrl,
    }));
}
