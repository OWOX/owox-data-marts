import { Badge } from '@owox/ui/components/badge';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { ExpandButton } from '@owox/ui/components/common/expand-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Box, Columns3, ExternalLink, GitMerge, Info, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { UserReference } from '../../../../../shared/components/UserReference';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';
import { useDebounce } from '../../../../../hooks/useDebounce';
import { formatDateShort } from '../../../../../utils/date-formatters';
import type {
  BlendedField,
  BlendedFieldOverride,
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';
import { SourceFieldsTable } from '../DataMartSchemaSettings/SourceFieldsTable';
import { JoinSettingsForm } from './JoinSettingsForm';

export interface SourceEntry {
  aliasPath: string;
  title: string;
  alias: string;
  depth: number;
  fieldCount: number;
  overrideCount: number;
  isIncluded: boolean;
  fields: BlendedField[];
  dataMartId: string;
}

type AccordionTab = 'fields' | 'join-settings';

interface RelationshipAccordionItemProps {
  row: TransientRelationshipRow;
  source: SourceEntry | null;
  dataMartId: string;
  storageId: string;
  /** Open this accordion on Join Settings tab on mount */
  defaultOpenTab?: AccordionTab;
  readOnly?: boolean;
  onDelete: (id: string) => Promise<void>;
  onRelationshipUpdated: (updated: DataMartRelationship) => void;
  onAliasChange: (source: SourceEntry, alias: string) => void;
  onHideForReportingChange: (aliasPath: string, alias: string, isHidden: boolean) => void;
  onFieldOverrideChange: (
    source: SourceEntry,
    fieldName: string,
    override: Partial<BlendedFieldOverride>
  ) => void;
}

export function RelationshipAccordionItem({
  row,
  source,
  dataMartId,
  defaultOpenTab,
  readOnly = false,
  onDelete,
  onRelationshipUpdated,
  onAliasChange,
  onHideForReportingChange,
  onFieldOverrideChange,
}: RelationshipAccordionItemProps) {
  const { scope } = useProjectRoute();
  const rel = row.relationship;
  const isTransient = row.depth >= 2;

  const [isOpen, setIsOpen] = useState(defaultOpenTab !== undefined);
  const [activeTab, setActiveTab] = useState<AccordionTab>(defaultOpenTab ?? 'fields');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Output alias doubles as the accordion's display label. Falls back to the
  // DM title when `source` is null (join conditions not configured yet) —
  // matches the value persisted by the creator.
  const displayAlias = source?.alias ?? rel.targetDataMart.title;
  const [localAlias, setLocalAlias] = useState(displayAlias);
  const debouncedAlias = useDebounce(localAlias, 500);
  const lastSavedAlias = useRef(displayAlias);

  useEffect(() => {
    setLocalAlias(displayAlias);
    lastSavedAlias.current = displayAlias;
  }, [displayAlias]);

  useEffect(() => {
    if (!source) return;
    if (debouncedAlias !== lastSavedAlias.current) {
      onAliasChange(source, debouncedAlias);
      lastSavedAlias.current = debouncedAlias;
    }
  }, [debouncedAlias, source, onAliasChange]);

  const handleAliasBlur = () => {
    if (!source) return;
    if (localAlias !== lastSavedAlias.current) {
      onAliasChange(source, localAlias);
      lastSavedAlias.current = localAlias;
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!defaultOpenTab) return;
    setIsOpen(true);
    setActiveTab(defaultOpenTab);
    // Delay scroll until Collapsible finishes expanding, so the whole
    // accordion lands in the viewport — not just the header.
    const timeoutId = window.setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fullyAbove = rect.top < 80;
      const partiallyBelow = rect.bottom > window.innerHeight - 40;
      if (fullyAbove || partiallyBelow) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [defaultOpenTab]);

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
  const actionsVisibilityClass = actionsVisible
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100';

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
          <div className={cn('min-w-0 flex-1', isDimmed && 'opacity-60')}>
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
              <ExpandButton
                isExpanded={isOpen}
                onToggle={() => {
                  setIsOpen(prev => !prev);
                }}
              />

              {/* Output alias + badges — clickable area */}
              <div
                className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'
                role='button'
                tabIndex={0}
                onClick={() => {
                  setIsOpen(prev => !prev);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') setIsOpen(prev => !prev);
                }}
              >
                <span className='truncate text-sm font-semibold'>{displayAlias}</span>

                {/* Fields badge */}
                <Badge variant='secondary' className='shrink-0 text-xs'>
                  {visibleCount} {visibleCount === 1 ? 'field' : 'fields'}
                </Badge>

                {/* Draft / Blocked / Join not configured badges */}
                {rel.targetDataMart.status === 'DRAFT' && (
                  <Badge
                    variant='outline'
                    className='shrink-0 border-orange-400 text-[10px] text-orange-500'
                  >
                    Draft
                  </Badge>
                )}
                {rel.joinConditions.length === 0 && (
                  <Badge
                    variant='outline'
                    className='shrink-0 border-orange-400 text-[10px] text-orange-500'
                  >
                    Join not configured
                  </Badge>
                )}
                {row.isBlocked && rel.targetDataMart.status !== 'DRAFT' && (
                  <Badge
                    variant='outline'
                    className='shrink-0 border-orange-400 text-[10px] text-orange-500'
                  >
                    Blocked
                  </Badge>
                )}
              </div>

              {/* Allow for reporting — rendered for both direct and transient rows */}
              <div
                className={cn(
                  'flex shrink-0 items-center gap-1.5 transition-opacity',
                  actionsVisibilityClass
                )}
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

              {/* Dropdown menu — controlled so siblings stay visible while open */}
              <div
                className={cn('shrink-0 transition-opacity', actionsVisibilityClass)}
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
            </div>

            {/* Expanded content */}
            <CollapsibleContent>
              <div className='border-border rounded-b-md border border-t-0 bg-white shadow-xs dark:bg-white/5 dark:shadow-none'>
                <Tabs
                  value={activeTab}
                  onValueChange={v => {
                    setActiveTab(v as AccordionTab);
                  }}
                >
                  {/* Segment control (left) · data mart identity (center) · creation metadata (right) */}
                  <div className='flex items-center gap-3 px-4 pt-3'>
                    <TabsList className='shrink-0'>
                      <TabsTrigger value='fields'>
                        <Columns3 className='h-4 w-4' />
                        Report Fields
                      </TabsTrigger>
                      <TabsTrigger value='join-settings'>
                        <GitMerge className='h-4 w-4' />
                        Join Settings
                      </TabsTrigger>
                    </TabsList>
                    <div className='text-muted-foreground flex min-w-0 flex-1 items-center justify-center gap-1.5 text-sm'>
                      <Box className='size-4 shrink-0' />
                      <span
                        className='text-foreground max-w-[240px] truncate font-medium'
                        title={rel.targetDataMart.title}
                      >
                        {rel.targetDataMart.title}
                      </span>
                      {rel.targetDataMart.description && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
                              <Info className='size-4 shrink-0' />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='top' className='max-w-xs'>
                            {rel.targetDataMart.description}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-muted-foreground/60 hover:text-muted-foreground h-5 w-5 shrink-0 p-0'
                        onClick={() => {
                          window.open(
                            scope(`/data-marts/${rel.targetDataMart.id}/data-setup`),
                            '_blank'
                          );
                        }}
                        aria-label='Open target data mart in new tab'
                      >
                        <ExternalLink className='size-4' />
                      </Button>
                    </div>
                    <div className='text-muted-foreground flex shrink-0 items-center gap-1.5 text-sm'>
                      <span>Joined {formatDateShort(rel.createdAt)}</span>
                      {rel.createdByUser && (
                        <>
                          <span>by</span>
                          <UserReference userProjection={rel.createdByUser} />
                        </>
                      )}
                    </div>
                  </div>

                  <TabsContent value='fields' className='px-4 pt-2 pb-2'>
                    {source ? (
                      <SourceFieldsTable
                        fields={source.fields}
                        onFieldOverrideChange={(fieldName, override) => {
                          onFieldOverrideChange(source, fieldName, override);
                        }}
                        leadingToolbar={
                          <div
                            className='bg-muted/50 flex flex-col gap-1.5 rounded-md p-3 dark:bg-white/5'
                            onClick={e => {
                              e.stopPropagation();
                            }}
                          >
                            <label className='flex items-center gap-1.5 text-sm font-medium'>
                              Output Alias
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
                                    <Info className='size-4 shrink-0' />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side='top' className='max-w-xs'>
                                  Short name that appears in the output data schema for fields from
                                  this data mart.
                                </TooltipContent>
                              </Tooltip>
                            </label>
                            <Input
                              value={localAlias}
                              onChange={e => {
                                setLocalAlias(e.target.value);
                              }}
                              onBlur={handleAliasBlur}
                              placeholder='e.g. campaign_performance'
                              className='bg-background h-8 text-sm dark:bg-white/5'
                            />
                          </div>
                        }
                      />
                    ) : (
                      <p className='text-muted-foreground py-4 text-sm'>
                        Fields will appear after configuring join conditions.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value='join-settings'>
                    <JoinSettingsForm
                      relationship={rel}
                      dataMartId={dataMartId}
                      readOnly={readOnly || isTransient}
                      inheritedFrom={
                        isTransient ? { id: row.sourceDmId, title: row.parentDataMartTitle } : null
                      }
                      onSaved={updated => {
                        onRelationshipUpdated(updated);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </CollapsibleContent>
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
