import { Badge } from '@owox/ui/components/badge';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { ExpandButton } from '@owox/ui/components/common/expand-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';
import type {
  BlendedFieldOverride,
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';
import { NoAccessIndicator } from './NoAccessIndicator';
import { RelationshipDetailsTabs, type RelationshipDetailsTab } from './RelationshipDetailsTabs';
import { RelationshipWarningBadges } from './RelationshipWarningBadges';
import type { SourceEntry } from './source-entries';
import { useOutputAliasDraft } from './useOutputAliasDraft';

interface RelationshipAccordionItemProps {
  row: TransientRelationshipRow;
  source: SourceEntry | null;
  dataMartId: string;
  storageId: string;
  /** Aliases used by other relationships that share the same source data mart. */
  siblingAliases: string[];
  /** Open this accordion on Join Settings tab on mount */
  defaultOpenTab?: RelationshipDetailsTab;
  readOnly?: boolean;
  onDelete: (id: string) => Promise<void>;
  onRelationshipUpdated: (updated: DataMartRelationship) => void;
  /**
   * Fired by the Description tab's autosave. Kept apart from `onRelationshipUpdated` because it
   * runs while the user is still typing: the parent must update the row in place, not reload
   * the list (which would unmount this row and the focused field).
   */
  onRelationshipDescriptionSaved: (updated: DataMartRelationship) => void;
  onAliasChange: (source: SourceEntry, alias: string) => void;
  onHideForReportingChange: (aliasPath: string, alias: string, isHidden: boolean) => void;
  onFieldOverrideChange: (
    source: SourceEntry,
    fieldName: string,
    override: Partial<BlendedFieldOverride>
  ) => void;
  onDescriptionOverrideChange: (source: SourceEntry, description: string) => void;
}

export function RelationshipAccordionItem({
  row,
  source,
  dataMartId,
  siblingAliases,
  defaultOpenTab,
  readOnly = false,
  onDelete,
  onRelationshipUpdated,
  onRelationshipDescriptionSaved,
  onAliasChange,
  onHideForReportingChange,
  onFieldOverrideChange,
  onDescriptionOverrideChange,
}: RelationshipAccordionItemProps) {
  const { scope } = useProjectRoute();
  const rel = row.relationship;
  const isTransient = row.depth >= 2;

  const [isOpen, setIsOpen] = useState(defaultOpenTab !== undefined && !row.isCycleStub);
  const [activeTab, setActiveTab] = useState<RelationshipDetailsTab>(defaultOpenTab ?? 'fields');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Output alias doubles as the accordion's display label. Falls back to the
  // DM title when `source` is null (join conditions not configured yet) —
  // matches the value persisted by the creator.
  const outputAlias = useOutputAliasDraft(source, rel.targetDataMart.title, onAliasChange);
  const displayAlias = outputAlias.savedValue;

  const containerRef = useRef<HTMLDivElement>(null);

  // Wait for the Collapsible's CSS expand transition before measuring so scrollIntoView
  // targets the final layout.
  const COLLAPSIBLE_EXPAND_DELAY_MS = 250;
  const STICKY_HEADER_OFFSET_PX = 80;
  const VIEWPORT_BOTTOM_OFFSET_PX = 40;

  useEffect(() => {
    if (!defaultOpenTab || row.isCycleStub) return;
    setIsOpen(true);
    setActiveTab(defaultOpenTab);
    const timeoutId = window.setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fullyAbove = rect.top < STICKY_HEADER_OFFSET_PX;
      const partiallyBelow = rect.bottom > window.innerHeight - VIEWPORT_BOTTOM_OFFSET_PX;
      if (fullyAbove || partiallyBelow) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, COLLAPSIBLE_EXPAND_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [defaultOpenTab, row.isCycleStub]);

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDelete(rel.id);
    } finally {
      setIsDeleting(false);
      setIsConfirmDeleteOpen(false);
    }
  };

  const visibleCount = source?.fields.filter(f => !f.isHidden).length ?? 0;

  const depth = row.depth - 1; // depth 1 = direct, show at 0 indent

  const isDimmed = source != null && !source.isIncluded;

  // Keep actions visible while the dropdown is open, otherwise they would
  // disappear as soon as the pointer leaves the row to reach the menu.
  const actionsVisible = isOpen || isMenuOpen;
  const actionsVisibilityClass = cn(
    'transition-opacity',
    actionsVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  );

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          ref={containerRef}
          className='flex items-start gap-1.5'
          style={{ marginLeft: `${depth * 20}px` }}
        >
          {isTransient && (
            <span className='text-muted-foreground/40 mt-2.5 shrink-0 text-xs'>{'\u21B3'}</span>
          )}
          <div className={cn('min-w-0 flex-1', (isDimmed || row.isCycleStub) && 'opacity-60')}>
            {/* Header */}
            <div
              className={cn(
                'group flex items-center gap-2 px-3 py-2 transition-colors',
                'bg-white dark:bg-white/5',
                'border border-transparent',
                'hover:bg-muted/70 dark:hover:bg-white/8',
                'shadow-xs dark:shadow-none',
                isOpen ? 'border-border rounded-t-md border-b' : 'rounded-md'
              )}
            >
              {!row.isCycleStub && (
                <ExpandButton
                  isExpanded={isOpen}
                  onToggle={() => {
                    setIsOpen(prev => !prev);
                  }}
                />
              )}

              {/* Output alias + badges — clickable area */}
              <div
                className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'
                role='button'
                tabIndex={0}
                onClick={() => {
                  if (!row.isCycleStub) setIsOpen(prev => !prev);
                }}
                onKeyDown={e => {
                  if (!row.isCycleStub && (e.key === 'Enter' || e.key === ' '))
                    setIsOpen(prev => !prev);
                }}
              >
                <span className='truncate text-sm font-semibold'>{displayAlias}</span>

                {!rel.targetDataMart.userHasAccess && <NoAccessIndicator />}

                {/* Fields badge */}
                {!row.isCycleStub && (
                  <Badge variant='secondary' className='shrink-0 text-xs'>
                    {visibleCount} {visibleCount === 1 ? 'field' : 'fields'}
                  </Badge>
                )}

                <RelationshipWarningBadges
                  relationship={rel}
                  isBlocked={row.isBlocked}
                  isCycleStub={row.isCycleStub}
                />
              </div>

              {/* Allow for reporting — rendered for both direct and transient rows */}
              {!row.isCycleStub && (
                <div
                  className={cn('flex shrink-0 items-center gap-1.5', actionsVisibilityClass)}
                  onClick={e => {
                    e.stopPropagation();
                  }}
                >
                  <span className='text-muted-foreground text-xs'>Allow for reporting</span>
                  <Switch
                    checked={source?.isIncluded ?? true}
                    onCheckedChange={checked => {
                      // Backend omits relationships without join conditions from
                      // availableSources (source is null). The preference is still
                      // persisted by aliasPath and becomes effective once joins
                      // are configured.
                      onHideForReportingChange(
                        source?.aliasPath ?? row.aliasPath,
                        source?.alias ?? rel.targetAlias,
                        !checked
                      );
                    }}
                  />
                </div>
              )}

              {/* Dropdown menu — controlled so siblings stay visible while open */}
              {!row.isCycleStub && (
                <div
                  className={cn('shrink-0', actionsVisibilityClass)}
                  onClick={e => {
                    e.stopPropagation();
                  }}
                >
                  <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
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
                      <DropdownMenuItem
                        onClick={() => {
                          window.open(
                            scope(`/data-marts/${rel.targetDataMart.id}/data-setup`),
                            '_blank'
                          );
                        }}
                      >
                        <ExternalLink className='h-4 w-4' />
                        Open in new tab
                      </DropdownMenuItem>
                      {/* Delete is disabled for transient rows — removing an inherited relationship must happen on its source data mart. */}
                      {isTransient ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <DropdownMenuItem
                                variant='destructive'
                                disabled
                                onSelect={e => {
                                  e.preventDefault();
                                }}
                              >
                                <Trash2 className='h-4 w-4' />
                                Delete relationship
                              </DropdownMenuItem>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='left' className='max-w-xs'>
                            This relationship is inherited. Remove it from the source data mart
                            instead.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <DropdownMenuItem
                          variant='destructive'
                          onClick={() => {
                            setIsConfirmDeleteOpen(true);
                          }}
                        >
                          <Trash2 className='h-4 w-4' />
                          Delete relationship
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Expanded content */}
            {!row.isCycleStub && (
              <CollapsibleContent>
                <div className='border-border rounded-b-md border border-t-0 bg-white shadow-xs dark:bg-white/5 dark:shadow-none'>
                  <RelationshipDetailsTabs
                    relationship={rel}
                    source={source}
                    dataMartId={dataMartId}
                    siblingAliases={siblingAliases}
                    readOnly={readOnly}
                    inheritedFrom={
                      isTransient ? { id: row.sourceDmId, title: row.parentDataMartTitle } : null
                    }
                    activeTab={activeTab}
                    onActiveTabChange={setActiveTab}
                    outputAlias={outputAlias}
                    onRelationshipUpdated={onRelationshipUpdated}
                    onRelationshipDescriptionSaved={onRelationshipDescriptionSaved}
                    onFieldOverrideChange={onFieldOverrideChange}
                    onDescriptionOverrideChange={onDescriptionOverrideChange}
                  />
                </div>
              </CollapsibleContent>
            )}
          </div>
        </div>
      </Collapsible>

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
