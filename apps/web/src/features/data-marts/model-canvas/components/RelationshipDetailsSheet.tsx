import {
  SheetHeaderAction,
  SheetHeaderActionButton,
} from '@owox/ui/components/common/sheet-header-action';
import { FormItem, FormLayout, FormSection } from '@owox/ui/components/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Switch } from '@owox/ui/components/switch';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useProjectRoute } from '../../../../shared/hooks/useProjectRoute';
import { SourceFieldsTable } from '../../edit/components/DataMartSchemaSettings/SourceFieldsTable';
import { JoinDescriptionForm } from '../../edit/components/DataMartRelationships/JoinDescriptionForm';
import { JoinSettingsForm } from '../../edit/components/DataMartRelationships/JoinSettingsForm';
import { NoAccessIndicator } from '../../edit/components/DataMartRelationships/NoAccessIndicator';
import { OutputAliasField } from '../../edit/components/DataMartRelationships/RelationshipDetailsTabs';
import { RelationshipWarningBadges } from '../../edit/components/DataMartRelationships/RelationshipWarningBadges';
import { useOutputAliasDraft } from '../../edit/components/DataMartRelationships/useOutputAliasDraft';
import { DataMartIconGlyph } from '../../shared/components/DataMartIcon';
import type { DataMartIconValue } from '../../shared/enums/data-mart-icon.enum';
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
  /**
   * Grows each time a relationship is picked with the keyboard: focus then moves into the sheet.
   * Zero for a pick with the pointer, which leaves focus where it is.
   */
  focusRequest?: number;
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
      className='hover:text-foreground inline-flex min-w-0 items-center gap-1 hover:underline'
    >
      <DataMartIconGlyph icon={dataMart.icon} className='size-3.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{dataMart.title}</span>
    </a>
  );
}

/**
 * The details of a relationship picked on the Models canvas, in a sheet laid out like the other
 * sheets of the app: a header, then sections of cards on a muted body. It edits the same settings
 * as the relationship's row in the source Data Mart's Joinable Data Marts block, and saves them as
 * they change. It is not modal: the canvas stays usable, so another arrow can be picked while it
 * is open.
 */
export default function RelationshipDetailsSheet({
  options,
  relationshipId,
  storageId,
  focusRequest = 0,
  onRelationshipChange,
  onClose,
}: RelationshipDetailsSheetProps) {
  const { scope } = useProjectRoute();
  const contentRef = useRef<HTMLDivElement>(null);
  const focusRequestRef = useRef(focusRequest);
  focusRequestRef.current = focusRequest;
  // A keyboard pick while the sheet is open already; the first open is handled once the content
  // has mounted, in `onOpenAutoFocus`.
  useEffect(() => {
    if (focusRequest > 0) contentRef.current?.focus();
  }, [focusRequest]);

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
        ref={contentRef}
        // A pointer pick keeps focus on the canvas, so no field looks active before the user
        // picks one. A keyboard pick moves focus to the sheet itself.
        onOpenAutoFocus={event => {
          event.preventDefault();
          if (focusRequestRef.current > 0) contentRef.current?.focus();
        }}
        // Not modal, so a click elsewhere leaves it open: on the canvas controls, the toolbar or
        // a menu. The canvas closes it on a click on a card or on the empty canvas.
        onInteractOutside={event => {
          event.preventDefault();
        }}
      >
        <SheetHeader className='pr-12'>
          <SheetTitle>Relationship</SheetTitle>
          <div className='flex w-full min-w-0 items-center gap-4'>
            <SheetDescription asChild>
              <div className='flex min-w-0 items-center gap-1'>
                <DataMartLink dataMart={active.source} />
                <ArrowRight className='size-3.5 shrink-0' aria-label='joins' />
                <DataMartLink dataMart={active.target} />
              </div>
            </SheetDescription>
            {/* The relationship's row in the Joinable Data Marts block of its source. */}
            <SheetHeaderAction className='shrink-0'>
              <SheetHeaderActionButton
                onClick={() => {
                  window.open(
                    scope(`/data-marts/${active.source.id}/data-setup`),
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
              >
                <ExternalLink className='h-3.5 w-3.5' />
                Open in Data Setup
              </SheetHeaderActionButton>
            </SheetHeaderAction>
          </div>
          {options.length > 1 && (
            <Tabs value={active.id} onValueChange={onRelationshipChange} className='mt-2'>
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
        <FormLayout>
          <RelationshipSourceScope
            key={active.source.id}
            option={active}
            storageId={storageId}
            onDeleted={onClose}
          />
        </FormLayout>
      </SheetContent>
    </Sheet>
  );
}

function DetailsSkeleton() {
  return (
    <div className='flex flex-col gap-3' aria-busy='true'>
      <Skeleton className='h-16 w-full' />
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
      <FormItem role='alert' className='items-start gap-3 text-sm'>
        <p className='text-muted-foreground'>
          {option.source.title} could not be loaded, so this relationship cannot be edited.
        </p>
        <Button type='button' variant='outline' size='sm' onClick={source.retry}>
          Retry
        </Button>
      </FormItem>
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
  const details = useRelationshipDetails({
    relationshipId: option.id,
    sourceDataMartId: option.source.id,
    storageId,
    configEditor,
  });
  const { relationship, source } = details;
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const allowForReportingId = useId();
  const outputAlias = useOutputAliasDraft(
    source,
    relationship?.targetDataMart.title ?? option.target.title,
    details.onAliasChange
  );

  if (details.isLoading) return <DetailsSkeleton />;

  if (!relationship) {
    if (details.isGraphError) {
      return (
        <FormItem role='alert' className='items-start gap-3 text-sm'>
          <p className='text-muted-foreground'>This relationship could not be loaded.</p>
          <Button type='button' variant='outline' size='sm' onClick={details.retryGraph}>
            Retry
          </Button>
        </FormItem>
      );
    }
    return (
      <FormItem role='alert'>
        <p className='text-muted-foreground text-sm'>
          This relationship no longer exists. It may have been deleted.
        </p>
      </FormItem>
    );
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    const deleted = await details.deleteRelationship();
    setIsDeleting(false);
    setIsConfirmDeleteOpen(false);
    if (deleted) onDeleted();
  };

  const sourceTitle = relationship.sourceDataMart.title;
  const targetTitle = relationship.targetDataMart.title;

  return (
    <>
      <FormSection title='General' name='relationship-sheet-general'>
        {/* Why the join does not work, or works with a caveat; hidden when there is nothing. */}
        <FormItem className='flex-row flex-wrap items-center gap-2 empty:hidden'>
          {!relationship.targetDataMart.userHasAccess && <NoAccessIndicator />}
          <RelationshipWarningBadges
            relationship={relationship}
            isBlocked={details.isBlocked}
            isCycleStub={details.isCycleStub}
          />
        </FormItem>
        {details.isCycleStub ? (
          // As in the Joinable Data Marts block, a loop has no settings to edit.
          <FormItem>
            <p className='text-muted-foreground text-sm'>
              {targetTitle} is already on this join path, so the join stops here to avoid a loop and
              has no settings to edit.
            </p>
          </FormItem>
        ) : (
          <FormItem>
            <div className='flex items-center justify-between gap-4'>
              <label htmlFor={allowForReportingId} className='text-sm font-medium'>
                Allow for reporting
              </label>
              <Switch
                id={allowForReportingId}
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
            </div>
            <p className='text-muted-foreground text-xs'>
              Turn off to hide every field of {targetTitle} from the reports of {sourceTitle}. The
              relationship stays in place.
            </p>
          </FormItem>
        )}
      </FormSection>

      {!details.isCycleStub && (
        <>
          <FormSection title='Join Settings' name='relationship-sheet-join-settings'>
            <JoinSettingsForm
              relationship={relationship}
              dataMartId={option.source.id}
              readOnly={false}
              siblingAliases={details.siblingAliases}
              inheritedFrom={null}
              variant='sheet'
              onSaved={details.onRelationshipUpdated}
            />
          </FormSection>

          <FormSection title='Description' name='relationship-sheet-description'>
            <FormItem>
              <JoinDescriptionForm
                relationship={relationship}
                dataMartId={option.source.id}
                inheritedFrom={null}
                variant='sheet'
                onSaved={details.onRelationshipDescriptionSaved}
              />
            </FormItem>
          </FormSection>

          <FormSection title='Report Fields' name='relationship-sheet-report-fields'>
            {source ? (
              <SourceFieldsTable
                fields={source.fields}
                onFieldOverrideChange={(fieldName, override) => {
                  details.onFieldOverrideChange(source, fieldName, override);
                }}
                leadingToolbar={<OutputAliasField outputAlias={outputAlias} variant='sheet' />}
                variant='sheet'
              />
            ) : (
              <FormItem>
                <p className='text-muted-foreground text-sm'>
                  Fields will appear after configuring join conditions.
                </p>
              </FormItem>
            )}
          </FormSection>
        </>
      )}

      <FormSection title='Danger zone' name='relationship-sheet-danger-zone' defaultOpen={false}>
        <FormItem>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-1'>
              <p className='text-sm font-medium'>Delete this relationship</p>
              <p className='text-muted-foreground text-sm'>
                Remove the join between {sourceTitle} and {targetTitle}. This action cannot be
                undone.
              </p>
            </div>
            <Button
              type='button'
              variant='outline'
              className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15 sm:shrink-0'
              onClick={() => {
                setIsConfirmDeleteOpen(true);
              }}
            >
              <Trash2 className='size-4' />
              Delete Relationship
            </Button>
          </div>
        </FormItem>
      </FormSection>

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
