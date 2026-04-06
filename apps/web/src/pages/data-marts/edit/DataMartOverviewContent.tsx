import { useOutletContext } from 'react-router-dom';
import { DataMartOverview } from '../../../features/data-marts/edit';
import { OwnersEditor } from '../../../features/data-marts/edit/components/OwnersEditor';
import { UserReference } from '../../../shared/components/UserReference/UserReference';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { BookOpenIcon, CalendarIcon, Info, Users } from 'lucide-react';
import type { UserProjectionDto } from '../../../shared/types/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface OutletContextType {
  dataMart: {
    id: string;
    description: string;
    createdAt: Date;
    createdByUser: UserProjectionDto | null;
    businessOwnerUsers: UserProjectionDto[];
    technicalOwnerUsers: UserProjectionDto[];
  };
  updateDataMartOwners: (
    id: string,
    businessOwnerIds: string[],
    technicalOwnerIds: string[]
  ) => Promise<void>;
  projectId: string;
}

export default function DataMartOverviewContent() {
  const { dataMart, updateDataMartOwners, projectId } = useOutletContext<OutletContextType>();

  return (
    <div data-testid='datamartTabOverview' className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='dm-owners'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Users}
            tooltip='Define who owns and maintains this Data Mart'
          >
            Ownership
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex gap-4'>
            <div className='group flex w-full flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <div className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'>
                <span>Technical Owner</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Responsible for data sources and schema
                  </TooltipContent>
                </Tooltip>
              </div>
              <OwnersEditor
                ownerUsers={dataMart.technicalOwnerUsers}
                projectId={projectId}
                onSave={users => {
                  void updateDataMartOwners(
                    dataMart.id,
                    dataMart.businessOwnerUsers.map(u => u.userId),
                    users.map(u => u.userId)
                  );
                }}
              />
            </div>
            <div className='group flex w-full flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <div className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'>
                <span>Business Owner</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Responsible for business requirements
                  </TooltipContent>
                </Tooltip>
              </div>
              <OwnersEditor
                ownerUsers={dataMart.businessOwnerUsers}
                projectId={projectId}
                onSave={users => {
                  void updateDataMartOwners(
                    dataMart.id,
                    users.map(u => u.userId),
                    dataMart.technicalOwnerUsers.map(u => u.userId)
                  );
                }}
              />
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name='dm-description'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={BookOpenIcon} tooltip='Description of this Data Mart'>
            Description
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartOverview />
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name='dm-details'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Info} tooltip='Metadata and additional details'>
            Details
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex gap-4'>
            <div className='group flex w-full flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <div className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'>
                <span>Created On</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    When this Data Mart was created
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className='flex items-center gap-2'>
                <div className='inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pr-3 pl-1 dark:bg-neutral-900'>
                  <div className='flex aspect-square h-7 w-7 items-center justify-center rounded-full border bg-white dark:bg-white/10'>
                    <CalendarIcon
                      className='text-muted-foreground size-3.5 shrink-0 transition-colors'
                      aria-hidden='true'
                    />
                  </div>
                  <div className='text-muted-foreground min-w-0 truncate text-sm leading-tight'>
                    {new Intl.DateTimeFormat('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(dataMart.createdAt))}
                  </div>
                </div>
              </div>
            </div>
            {dataMart.createdByUser && (
              <div className='group flex w-full flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
                <div className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'>
                  <span>Created By</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        tabIndex={-1}
                        className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                        aria-label='Help information'
                      >
                        <Info
                          className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                          aria-hidden='true'
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side='top' align='center' role='tooltip'>
                      The user who created this Data Mart
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className='flex items-center gap-2'>
                  <UserReference userProjection={dataMart.createdByUser} variant='full' />
                </div>
              </div>
            )}
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </div>
  );
}
