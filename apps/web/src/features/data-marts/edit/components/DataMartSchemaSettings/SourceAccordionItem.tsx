import { useEffect, useRef, useState } from 'react';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { ExpandButton } from '@owox/ui/components/common/expand-button';
import { Switch } from '@owox/ui/components/switch';
import { Input } from '@owox/ui/components/input';
import type { BlendedFieldOverride } from '../../../shared/types/relationship.types';
import type { SourceEntry } from './BlendedSourcesSubsection';
import { SourceFieldsTable } from './SourceFieldsTable';
import { useDebounce } from '../../../../../hooks/useDebounce';

interface SourceAccordionItemProps {
  source: SourceEntry;
  onAliasChange: (alias: string) => void;
  onHideForReportingChange: (isHidden: boolean) => void;
  onFieldOverrideChange: (fieldName: string, override: Partial<BlendedFieldOverride>) => void;
}

export function SourceAccordionItem({
  source,
  onAliasChange,
  onHideForReportingChange,
  onFieldOverrideChange,
}: SourceAccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localAlias, setLocalAlias] = useState(source.alias);
  const debouncedAlias = useDebounce(localAlias, 500);
  const lastSavedAlias = useRef(source.alias);
  const onAliasChangeRef = useRef(onAliasChange);
  onAliasChangeRef.current = onAliasChange;

  useEffect(() => {
    if (debouncedAlias !== lastSavedAlias.current) {
      onAliasChangeRef.current(debouncedAlias);
      lastSavedAlias.current = debouncedAlias;
    }
  }, [debouncedAlias]);

  const handleAliasBlur = () => {
    if (localAlias !== lastSavedAlias.current) {
      onAliasChange(localAlias);
      lastSavedAlias.current = localAlias;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className='flex items-start gap-1.5' style={{ marginLeft: `${source.depth * 20}px` }}>
        {source.depth > 0 && (
          <span className='text-muted-foreground/40 mt-2.5 shrink-0 text-xs'>{'\u21B3'}</span>
        )}
        <div className='min-w-0 flex-1'>
          <div
            className={`bg-muted hover:bg-muted/80 flex items-center gap-3 px-3 py-2.5 transition-colors ${isOpen ? 'rounded-t-md' : 'rounded-md'}`}
          >
            <ExpandButton
              isExpanded={isOpen}
              onToggle={() => {
                setIsOpen(prev => !prev);
              }}
            />

            <div
              className='min-w-0 flex-1 cursor-pointer'
              role='button'
              tabIndex={0}
              onClick={() => {
                setIsOpen(prev => !prev);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') setIsOpen(prev => !prev);
              }}
            >
              <div className='truncate text-sm font-semibold'>{source.title}</div>
            </div>

            <span className='text-muted-foreground shrink-0 text-sm'>
              Fields: {source.fields.filter(f => !f.isHidden).length} visible
              {source.fields.some(f => f.isHidden) &&
                ` · ${source.fields.filter(f => f.isHidden).length} hidden`}
            </span>

            <div
              className='ml-4 flex shrink-0 items-center gap-1.5'
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <span className='text-muted-foreground text-sm whitespace-nowrap'>Alias</span>
              <Input
                value={localAlias}
                onChange={e => {
                  setLocalAlias(e.target.value);
                }}
                onBlur={handleAliasBlur}
                className='w-72'
              />
            </div>

            <div
              className='ml-4 flex shrink-0 items-center gap-1.5'
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <span className='text-muted-foreground text-sm whitespace-nowrap'>
                Allow for reporting
              </span>
              <Switch
                checked={source.isIncluded}
                onCheckedChange={checked => {
                  onHideForReportingChange(!checked);
                }}
              />
            </div>
          </div>

          <CollapsibleContent>
            <div className='bg-background rounded-b-md px-4 pb-2'>
              <SourceFieldsTable
                fields={source.fields}
                isSourceIncluded={source.isIncluded}
                onFieldOverrideChange={onFieldOverrideChange}
              />
            </div>
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}
