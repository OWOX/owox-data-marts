import { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertTriangle, Pencil, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../shared/components/Button';
import { UserAvatarGroup } from '../../../../shared/components/UserAvatarGroup/UserAvatarGroup';
import { UserReference } from '../../../../shared/components/UserReference/UserReference';
import { useProjectMembers } from '../../../notifications/project/hooks/useNotificationSettings';
import type { UserProjectionDto } from '../../../../shared/types/api';
import type { ProjectMember } from '../../../notifications/project/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface OwnersEditorProps {
  ownerUsers: UserProjectionDto[];
  onSave: (userIds: string[]) => void;
  projectId: string;
}

export function OwnersEditor({ ownerUsers, onSave, projectId }: OwnersEditorProps) {
  const { members, isLoading: isMembersLoading } = useProjectMembers(projectId);
  const [isOpen, setIsOpen] = useState(false);

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

  // Detect which displayed owners are outbound (for rendering warning in display)
  const outboundIds = useMemo(
    () => new Set(members.filter(m => m.isOutbound).map(m => m.userId)),
    [members]
  );
  const hasOutboundOwner = ownerUsers.some(
    u => outboundIds.has(u.userId) || !memberIds.has(u.userId)
  );

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
      <Popover open={isOpen} onOpenChange={setIsOpen}>
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
            <div className='max-h-60 space-y-1 overflow-y-auto'>
              {activeMembers.map((member: ProjectMember) => (
                <MemberCheckbox
                  key={member.userId}
                  member={member}
                  isSelected={selectedIds.includes(member.userId)}
                  onToggle={handleToggle}
                />
              ))}
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
              {activeMembers.length === 0 &&
                outboundMembers.length === 0 &&
                unknownOwners.length === 0 && (
                  <div className='text-muted-foreground py-2 text-center text-sm'>
                    No project members found
                  </div>
                )}
            </div>
          )}
          <Link
            to={`/${projectId}/settings/members`}
            className='text-primary mt-2 block text-xs hover:underline'
          >
            Add colleagues
          </Link>
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
      <Label htmlFor={`owner-${member.userId}`} className='flex-1 cursor-pointer text-sm'>
        {member.displayName ?? member.email}
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
          <span className='text-muted-foreground flex items-center gap-1 text-sm'>
            {member.displayName ?? member.email}
            <AlertTriangle className='h-3.5 w-3.5 text-yellow-500' />
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
            <AlertTriangle className='h-3.5 w-3.5 text-yellow-500' />
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>This user is no longer a member of the project</TooltipContent>
    </Tooltip>
  );
}
