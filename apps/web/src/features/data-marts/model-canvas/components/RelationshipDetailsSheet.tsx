import { Skeleton } from '@owox/ui/components/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { Switch } from '@owox/ui/components/switch';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { ArrowRight, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useProjectRoute } from '../../../../shared/hooks/useProjectRoute';
import { NoAccessIndicator } from '../../edit/components/DataMartRelationships/NoAccessIndicator';
import {
  RelationshipDetailsTabs,
  type RelationshipDetailsTab,
} from '../../edit/components/DataMartRelationships/RelationshipDetailsTabs';
import { RelationshipWarningBadges } from '../../edit/components/DataMartRelationships/RelationshipWarningBadges';
import { useOutputAliasDraft } from '../../edit/components/DataMartRelationships/useOutputAliasDraft';
import { DataMartIconGlyph } from '../../shared/components/DataMartIcon';
import type { DataMartIconValue } from '../../shared/enums/data-mart-icon.enum';
import { RELATIONSHIP_SHEET_WIDTH_CLASS } from '../model/relationship-sheet-layout';
import { useRelationshipDetails } from '../model/use-relationship-details';
import {
  useRelationshipSourceConfig,
  type RelationshipConfigEditor,
} from '../model/use-relationship-source-config';

export interface RelationshipSheetDataMart {
  id: string;
  title: string;
  icon?: DataMartIconValue | null;
}

/** One relationship an arrow draws, with the Data Marts at its two ends. */
export interface RelationshipSheetOption {
  id: string;
  source: RelationshipSheetDataMart;
  target: RelationshipSheetDataMart;
}

interface RelationshipDetailsSheetProps {
  /** The relationships of the clicked arrow: two for a two-headed one, one otherwise. */
  options: RelationshipSheetOption[];
  relationshipId: string;
  storageId: string;
  onRelationshipChange: (relationshipId: string) => void;
  onClose: () => void;
}

function DataMartLink({ dataMart }: { dataMart: RelationshipSheetDataMart }) {
  const { scope } = useProjectRoute();
  return (
    <a
      href={scope(`/data-marts/${dataMart.id}/data-setup`)}
      target='_blank'
      rel='noopener noreferrer'
      title={`Open ${dataMart.title} in a new tab`}
      className='text-foreground hover:bg-muted inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-medium'
    >
      <DataMartIconGlyph icon={dataMart.icon} className='size-4 shrink-0' aria-hidden='true' />
      <span className='truncate'>{dataMart.title}</span>
    </a>
  );
}

/**
 * The details of a relationship picked on the Models canvas, docked on the right. It edits the
 * same settings as the relationship's row in the source Data Mart's Joinable Data Marts block.
 * It is not modal: the canvas stays usable, so another arrow can be picked while it is open.
 */
export default function RelationshipDetailsSheet({
  options,
  relationshipId,
  storageId,
  onRelationshipChange,
  onClose,
}: RelationshipDetailsSheetProps) {
  const active = options.find(option => option.id === relationshipId) ?? options.at(0);
  if (!active) return null;

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className={`gap-0 ${RELATIONSHIP_SHEET_WIDTH_CLASS}`}
        // Focus stays on the canvas, and no field looks active before the user picks one.
        onOpenAutoFocus={event => {
          event.preventDefault();
        }}
        // Not modal, so a click elsewhere leaves it open: on the canvas controls, the toolbar or
        // a menu. The canvas closes it on a click on a card or on the empty canvas.
        onInteractOutside={event => {
          event.preventDefault();
        }}
      >
        <SheetHeader className='gap-2 pr-12'>
          <SheetTitle>Relationship</SheetTitle>
          <SheetDescription asChild>
            <div className='flex min-w-0 items-center gap-1'>
              <DataMartLink dataMart={active.source} />
              <ArrowRight className='size-4 shrink-0' aria-label='joins' />
              <DataMartLink dataMart={active.target} />
            </div>
          </SheetDescription>
          {options.length > 1 && (
            <Tabs value={active.id} onValueChange={onRelationshipChange}>
              <TabsList aria-label='Direction'>
                {options.map(option => (
                  <TabsTrigger key={option.id} value={option.id}>
                    {option.source.title} → {option.target.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </SheetHeader>
        <div className='flex-1 overflow-y-auto'>
          <RelationshipSourceScope
            key={active.source.id}
            option={active}
            storageId={storageId}
            onDeleted={onClose}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailsSkeleton() {
  return (
    <div className='flex flex-col gap-3 p-4' aria-busy='true'>
      <Skeleton className='h-8 w-full' />
      <Skeleton className='h-40 w-full' />
    </div>
  );
}

/**
 * One per source Data Mart. Its relationships write to the same blended fields config, so they
 * share one editor and save queue: switching between two of them never sends two whole-config
 * saves side by side. Nothing is editable before the source has loaded, because a save that
 * starts from an empty config would drop the settings of the source's other joins.
 */
function RelationshipSourceScope({
  option,
  storageId,
  onDeleted,
}: {
  option: RelationshipSheetOption;
  storageId: string;
  onDeleted: () => void;
}) {
  const source = useRelationshipSourceConfig(option.source.id);

  if (!source.sourceDataMart) {
    if (source.isLoading) return <DetailsSkeleton />;
    return (
      <div role='alert' className='flex flex-col items-start gap-3 p-4 text-sm'>
        <p className='text-muted-foreground'>
          {option.source.title} could not be loaded, so this relationship cannot be edited.
        </p>
        <Button type='button' variant='outline' size='sm' onClick={source.retry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <RelationshipDetailsBody
      key={option.id}
      option={option}
      storageId={storageId}
      configEditor={source.configEditor}
      onDeleted={onDeleted}
    />
  );
}

function RelationshipDetailsBody({
  option,
  storageId,
  configEditor,
  onDeleted,
}: {
  option: RelationshipSheetOption;
  storageId: string;
  configEditor: RelationshipConfigEditor;
  onDeleted: () => void;
}) {
  const { scope } = useProjectRoute();
  const details = useRelationshipDetails({
    relationshipId: option.id,
    sourceDataMartId: option.source.id,
    storageId,
    configEditor,
  });
  const { relationship, source } = details;
  const [activeTab, setActiveTab] = useState<RelationshipDetailsTab>('join-settings');
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const outputAlias = useOutputAliasDraft(
    source,
    relationship?.targetDataMart.title ?? option.target.title,
    details.onAliasChange
  );

  if (details.isLoading) return <DetailsSkeleton />;

  if (!relationship) {
    if (details.isGraphError) {
      return (
        <div role='alert' className='flex flex-col items-start gap-3 p-4 text-sm'>
          <p className='text-muted-foreground'>This relationship could not be loaded.</p>
          <Button type='button' variant='outline' size='sm' onClick={details.retryGraph}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <p role='alert' className='text-muted-foreground p-4 text-sm'>
        This relationship no longer exists. It may have been deleted.
      </p>
    );
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    const deleted = await details.deleteRelationship();
    setIsDeleting(false);
    setIsConfirmDeleteOpen(false);
    if (deleted) onDeleted();
  };

  return (
    <>
      <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2.5'>
        {!relationship.targetDataMart.userHasAccess && <NoAccessIndicator />}
        <RelationshipWarningBadges
          relationship={relationship}
          isBlocked={details.isBlocked}
          isCycleStub={details.isCycleStub}
        />
        <div className='ml-auto flex shrink-0 items-center gap-1.5'>
          {!details.isCycleStub && (
            <>
              <span className='text-muted-foreground text-xs'>Allow for reporting</span>
              <Switch
                aria-label='Allow for reporting'
                checked={source?.isIncluded ?? true}
                onCheckedChange={checked => {
                  // A join without conditions has no source entry yet. The preference is still
                  // stored by alias path and takes effect once the join is configured.
                  details.onHideForReportingChange(
                    source?.aliasPath ?? details.aliasPath ?? relationship.targetAlias,
                    source?.alias ?? relationship.targetAlias,
                    !checked
                  );
                }}
              />
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 w-7 cursor-pointer p-0'
                aria-label='More actions'
              >
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {/* The relationship's row in the Joinable Data Marts block of its source. */}
              <DropdownMenuItem
                onClick={() => {
                  window.open(
                    scope(`/data-marts/${option.source.id}/data-setup`),
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
              >
                <ExternalLink className='h-4 w-4' />
                Open in Data Setup
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => {
                  setIsConfirmDeleteOpen(true);
                }}
              >
                <Trash2 className='h-4 w-4' />
                Delete relationship
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {details.isCycleStub ? (
        // As in the Joinable Data Marts block, a loop has no settings to edit.
        <p className='text-muted-foreground p-4 text-sm'>
          {relationship.targetDataMart.title} is already on this join path, so the join stops here
          to avoid a loop and has no settings to edit.
        </p>
      ) : (
        <RelationshipDetailsTabs
          relationship={relationship}
          source={source}
          dataMartId={option.source.id}
          siblingAliases={details.siblingAliases}
          readOnly={false}
          inheritedFrom={null}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          outputAlias={outputAlias}
          onRelationshipUpdated={details.onRelationshipUpdated}
          onRelationshipDescriptionSaved={details.onRelationshipDescriptionSaved}
          onFieldOverrideChange={details.onFieldOverrideChange}
          onDescriptionOverrideChange={details.onDescriptionOverrideChange}
        />
      )}

      <ConfirmationDialog
        open={isConfirmDeleteOpen}
        onOpenChange={open => {
          if (!open) setIsConfirmDeleteOpen(false);
        }}
        title='Delete Relationship'
        description='Are you sure you want to delete this relationship? This action cannot be undone.'
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />
    </>
  );
}
