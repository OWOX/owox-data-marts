import { useOutletContext } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
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
import { BookOpenIcon, CalendarIcon, Globe, Info, Lock, Tags, Users } from 'lucide-react';
import { ContextPicker } from '../../../features/contexts/components/ContextPicker/ContextPicker';
import { contextService } from '../../../features/contexts/services/context.service';
import { Switch } from '@owox/ui/components/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import type { UserProjectionDto } from '../../../shared/types/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { dataMartService } from '../../../features/data-marts/shared/services/data-mart.service';

interface OutletContextType {
  dataMart: {
    id: string;
    description: string;
    createdAt: Date;
    createdByUser: UserProjectionDto | null;
    businessOwnerUsers: UserProjectionDto[];
    technicalOwnerUsers: UserProjectionDto[];
    availableForReporting?: boolean;
    availableForMaintenance?: boolean;
    contexts?: { id: string; name: string }[];
  };
  updateDataMartOwners: (
    id: string,
    businessOwnerIds: string[],
    technicalOwnerIds: string[]
  ) => Promise<void>;
  getDataMart: (id: string) => Promise<void>;
  projectId: string;
}

export default function DataMartOverviewContent() {
  const { dataMart, updateDataMartOwners, getDataMart, projectId } =
    useOutletContext<OutletContextType>();

  const [availableForReporting, setAvailableForReporting] = useState(
    dataMart.availableForReporting !== false
  );
  const [availableForMaintenance, setAvailableForMaintenance] = useState(
    dataMart.availableForMaintenance !== false
  );
  const [contextIds, setContextIds] = useState<string[]>((dataMart.contexts ?? []).map(c => c.id));

  // Sync local state when dataMart props change (after refetch)
  useEffect(() => {
    setAvailableForReporting(dataMart.availableForReporting !== false);
    setAvailableForMaintenance(dataMart.availableForMaintenance !== false);
  }, [dataMart.availableForReporting, dataMart.availableForMaintenance]);

  useEffect(() => {
    setContextIds((dataMart.contexts ?? []).map(c => c.id));
  }, [dataMart.contexts]);

  const handleAvailabilityChange = useCallback(
    async (reporting: boolean, maintenance: boolean) => {
      await dataMartService.updateDataMartAvailability(dataMart.id, {
        availableForReporting: reporting,
        availableForMaintenance: maintenance,
      });
      toast.success('Availability updated');
      void getDataMart(dataMart.id);
    },
    [dataMart.id, getDataMart]
  );

  return (
    <div data-testid='datamartTabOverview' className='flex flex-col gap-4'>
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
              <Accordion variant='common' type='single' collapsible>
                <AccordionItem value='technical-owner-help'>
                  <AccordionTrigger className='text-sm'>
                    What is a Technical Owner?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className='text-muted-foreground text-sm'>
                      Technical Owner is direct maintenance ownership of this Data Mart. When the
                      owner&apos;s role is Technical User or Project Admin, they may edit and delete
                      the Data Mart, configure its Availability, and maintain its Triggers, Reports
                      and nested Report Triggers — regardless of Availability settings. Assigning
                      Technical Owner to a Business User stores the assignment but grants no
                      maintenance permissions until the role changes.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
              <Accordion variant='common' type='single' collapsible>
                <AccordionItem value='business-owner-help'>
                  <AccordionTrigger className='text-sm'>What is a Business Owner?</AccordionTrigger>
                  <AccordionContent>
                    <p className='text-muted-foreground text-sm'>
                      Business Owner is direct reporting ownership of this Data Mart. Business
                      Owners may see the Data Mart in the catalog, open it, use it for reporting,
                      and see its Triggers, Reports and nested Report Triggers — regardless of
                      Availability settings. This role does not grant editing, deleting, Sharing
                      management, Trigger maintenance, or changing owners.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name='dm-availability'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={availableForReporting || availableForMaintenance ? Globe : Lock}
            tooltip='Control who can see and work with this Data Mart'
          >
            Availability
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex gap-4'>
            <div className='group flex w-full flex-col gap-3 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <div className='flex items-center gap-4'>
                <Switch
                  checked={availableForMaintenance}
                  onCheckedChange={v => {
                    setAvailableForMaintenance(v);
                    void handleAvailabilityChange(availableForReporting, v);
                  }}
                />
                <div className='text-foreground text-sm font-medium'>Available for maintenance</div>
              </div>
              <p className='text-muted-foreground text-xs'>
                Technical users can edit, delete, and manage triggers for this Data Mart
              </p>
              <Accordion variant='common' type='single' collapsible>
                <AccordionItem value='maintenance-help'>
                  <AccordionTrigger className='text-sm'>
                    What does &quot;Available for maintenance&quot; mean?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className='text-muted-foreground text-sm'>
                      When enabled, Technical Users who are not owners can edit the Data Mart
                      definition, delete it, and manage its scheduled triggers. Business Users are
                      not affected by this setting.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div className='group flex w-full flex-col gap-3 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <div className='flex items-center gap-4'>
                <Switch
                  checked={availableForReporting}
                  onCheckedChange={v => {
                    setAvailableForReporting(v);
                    void handleAvailabilityChange(v, availableForMaintenance);
                  }}
                />
                <div className='text-foreground text-sm font-medium'>Available for reporting</div>
              </div>
              <p className='text-muted-foreground text-xs'>
                All project members can see this Data Mart and build reports on it
              </p>
              <Accordion variant='common' type='single' collapsible>
                <AccordionItem value='reporting-help'>
                  <AccordionTrigger className='text-sm'>
                    What does &quot;Available for reporting&quot; mean?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className='text-muted-foreground text-sm'>
                      When enabled, all project members (both Technical and Business Users) can see
                      this Data Mart in the catalog and use it to create reports. Owners always have
                      access regardless of this setting.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name='dm-contexts'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Tags}
            tooltip='Business domain contexts assigned to this Data Mart'
          >
            Contexts
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='group flex w-full flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
            <ContextPicker
              selectedContextIds={contextIds}
              onChange={next => {
                setContextIds(next);
                void (async () => {
                  try {
                    await contextService.updateDataMartContexts(dataMart.id, next);
                    toast.success('Contexts updated');
                    void getDataMart(dataMart.id);
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : 'Failed to update contexts'
                    );
                    void getDataMart(dataMart.id);
                  }
                })();
              }}
              idPrefix='dm-ctx'
            />
            <Accordion variant='common' type='single' collapsible>
              <AccordionItem value='contexts-help'>
                <AccordionTrigger className='text-sm'>What are Contexts?</AccordionTrigger>
                <AccordionContent>
                  <p className='text-muted-foreground text-sm'>
                    Contexts are business domains (e.g. Marketing, Finance, Sales) used to group
                    Data Marts, Storages and Destinations. They also control access: a member with
                    the role scope limited to specific contexts will only see resources assigned to
                    those contexts. Assign one or more contexts to make this Data Mart discoverable
                    to the right people.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
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
