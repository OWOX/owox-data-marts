import { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertTriangle, Pencil, Search, User } from 'lucide-react';

import { Button } from '../../../../shared/components/Button';
import { UserAvatarGroup } from '../../../../shared/components/UserAvatarGroup/UserAvatarGroup';
import { UserReference } from '../../../../shared/components/UserReference/UserReference';
import { useProjectMembers } from '../../../notifications/project/hooks/useNotificationSettings';
import type { UserProjectionDto } from '../../../../shared/types/api';
import type { ProjectMember } from '../../../notifications/project/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useFlags } from '../../../../app/store/hooks/useFlags';
import { checkVisible } from '../../../../utils/check-visible';

interface OwnersEditorProps {
  ownerUsers: UserProjectionDto[];
  onSave: (userIds: string[]) => void;
  projectId: string;
}

export function OwnersEditor({ ownerUsers, onSave, projectId }: OwnersEditorProps) {
  const { members, isLoading: isMembersLoading } = useProjectMembers(projectId);
  const { flags } = useFlags();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const addColleaguesHref = useMemo(() => {
    if (checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags)) {
      return `https://platform.owox.com/ui/p/${projectId}/settings/members`;
    }
    if (checkVisible('IDP_PROVIDER', ['better-auth'], flags)) {
      return '/auth';
    }
    return null;
  }, [flags, projectId]);

  const selectedIds = useMemo(() => ownerUsers.map(u => u.userId), [ownerUsers]);

  const handleToggle = useCallback(
    (userId: string, checked: boolean) => {
      const newIds = checked ? [...selectedIds, userId] : selectedIds.filter(id => id !== userId);
      onSave(newIds);
    },
    [selectedIds, onSave]
  );

  // Split members into active and outbound
  const activeMembers = useMemo(() => members.filter(m => !m.isOutbound), [members]);
  const outboundMembers = useMemo(
    () => members.filter(m => m.isOutbound && selectedIds.includes(m.userId)),
    [members, selectedIds]
  );

  // Owners whose userId is not found in members at all (edge case: user projection only)
  const memberIds = useMemo(() => new Set(members.map(m => m.userId)), [members]);
  const unknownOwners = useMemo(
    () => ownerUsers.filter(u => !memberIds.has(u.userId)),
    [ownerUsers, memberIds]
  );

  // Filter active members by search query
  const filteredActiveMembers = useMemo(() => {
    if (!searchQuery.trim()) return activeMembers;
    const q = searchQuery.toLowerCase();
    return activeMembers.filter(
      m => (m.displayName?.toLowerCase().includes(q) ?? false) || m.email.toLowerCase().includes(q)
    );
  }, [activeMembers, searchQuery]);

  // Detect which displayed owners are outbound (for rendering warning in display)
  const outboundIds = useMemo(
    () => new Set(members.filter(m => m.isOutbound).map(m => m.userId)),
    [members]
  );
  const hasOutboundOwner = ownerUsers.some(
    u => outboundIds.has(u.userId) || !memberIds.has(u.userId)
  );

  // Reset search when popover closes
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setSearchQuery('');
  }, []);

  return (
    <div className='flex items-center gap-2'>
      {ownerUsers.length === 1 ? (
        <div className='flex items-center gap-1'>
          <UserReference userProjection={ownerUsers[0]} variant='full' />
          {(outboundIds.has(ownerUsers[0].userId) || !memberIds.has(ownerUsers[0].userId)) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className='h-4 w-4 text-yellow-500' />
              </TooltipTrigger>
              <TooltipContent>This user is no longer a member of the project</TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : ownerUsers.length > 1 ? (
        <div className='flex items-center gap-1'>
          <UserAvatarGroup
            users={ownerUsers.map(u => ({
              userId: u.userId,
              fullName: u.fullName,
              email: u.email,
              avatar: u.avatar,
            }))}
          />
          {hasOutboundOwner && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className='h-4 w-4 text-yellow-500' />
              </TooltipTrigger>
              <TooltipContent>Some owners are no longer members of the project</TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <span className='text-muted-foreground text-sm'>—</span>
      )}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant='ghost' size='sm' className='h-7 w-7 p-0'>
            <Pencil className='h-3.5 w-3.5' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-80 p-3'>
          <div className='mb-2 text-sm font-medium'>Select owners</div>
          {isMembersLoading ? (
            <div className='space-y-2'>
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className='h-8 w-full' />
              ))}
            </div>
          ) : (
            <>
              {activeMembers.length > 5 && (
                <div className='relative mb-2'>
                  <Search className='text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2' />
                  <Input
                    placeholder='Search by name or email...'
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                    }}
                    className='h-8 pl-8 text-sm'
                  />
                </div>
              )}
              <div className='max-h-60 space-y-1 overflow-y-auto'>
                {filteredActiveMembers.map((member: ProjectMember) => (
                  <MemberCheckbox
                    key={member.userId}
                    member={member}
                    isSelected={selectedIds.includes(member.userId)}
                    onToggle={handleToggle}
                  />
                ))}
                {filteredActiveMembers.length === 0 && searchQuery.trim() !== '' && (
                  <div className='text-muted-foreground py-2 text-center text-sm'>
                    No members match &quot;{searchQuery}&quot;
                  </div>
                )}
                {outboundMembers.map((member: ProjectMember) => (
                  <OutboundMemberCheckbox
                    key={member.userId}
                    member={member}
                    onToggle={handleToggle}
                  />
                ))}
                {unknownOwners.map(user => (
                  <OutboundOwnerRow key={user.userId} user={user} onToggle={handleToggle} />
                ))}
                {filteredActiveMembers.length === 0 &&
                  outboundMembers.length === 0 &&
                  unknownOwners.length === 0 &&
                  searchQuery.trim() === '' && (
                    <div className='text-muted-foreground py-2 text-center text-sm'>
                      No project members found
                    </div>
                  )}
              </div>
            </>
          )}
          {addColleaguesHref && (
            <a
              href={addColleaguesHref}
              target={addColleaguesHref.startsWith('http') ? '_blank' : undefined}
              rel={addColleaguesHref.startsWith('http') ? 'noopener noreferrer' : undefined}
              className='text-primary mt-2 block text-xs hover:underline'
            >
              Add colleagues
            </a>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MemberCheckbox({
  member,
  isSelected,
  onToggle,
}: {
  member: ProjectMember;
  isSelected: boolean;
  onToggle: (userId: string, checked: boolean) => void;
}) {
  return (
    <div className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1.5'>
      <Checkbox
        id={`owner-${member.userId}`}
        checked={isSelected}
        onCheckedChange={checked => {
          onToggle(member.userId, checked as boolean);
        }}
      />
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={member.displayName ?? member.email}
          className='h-6 w-6 rounded-full object-cover'
        />
      ) : (
        <div className='bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs'>
          <User className='h-3 w-3' />
        </div>
      )}
      <Label
        htmlFor={`owner-${member.userId}`}
        className='flex flex-1 cursor-pointer items-center justify-between text-sm'
      >
        <span className='truncate'>{member.displayName ?? member.email}</span>
        <span className='text-muted-foreground ml-1 text-xs font-normal capitalize'>
          {member.role}
        </span>
      </Label>
    </div>
  );
}

function OutboundMemberCheckbox({
  member,
  onToggle,
}: {
  member: ProjectMember;
  onToggle: (userId: string, checked: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex items-center gap-2 rounded-md p-1.5 opacity-50'>
          <Checkbox
            checked={true}
            onCheckedChange={() => {
              onToggle(member.userId, false);
            }}
          />
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.displayName ?? member.email}
              className='h-6 w-6 rounded-full object-cover'
            />
          ) : (
            <div className='bg-muted flex h-6 w-6 items-center justify-center rounded-full'>
              <User className='h-3 w-3' />
            </div>
          )}
          <span className='text-muted-foreground flex flex-1 items-center justify-between text-sm'>
            <span className='flex items-center gap-1 truncate'>
              {member.displayName ?? member.email}
              <AlertTriangle className='h-3.5 w-3.5 shrink-0 text-yellow-500' />
            </span>
            <span className='ml-1 text-xs capitalize'>{member.role}</span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>This user is no longer a member of the project</TooltipContent>
    </Tooltip>
  );
}

function OutboundOwnerRow({
  user,
  onToggle,
}: {
  user: UserProjectionDto;
  onToggle: (userId: string, checked: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex items-center gap-2 rounded-md p-1.5 opacity-50'>
          <Checkbox
            checked={true}
            onCheckedChange={() => {
              onToggle(user.userId, false);
            }}
          />
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.fullName ?? 'Removed user'}
              className='h-6 w-6 rounded-full object-cover'
            />
          ) : (
            <div className='bg-muted flex h-6 w-6 items-center justify-center rounded-full'>
              <User className='h-3 w-3' />
            </div>
          )}
          <span className='text-muted-foreground flex items-center gap-1 text-sm'>
            {user.fullName ?? user.email ?? 'Removed user'}
            <AlertTriangle className='h-3.5 w-3.5 shrink-0 text-yellow-500' />
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>This user is no longer a member of the project</TooltipContent>
    </Tooltip>
  );
}
