import { useMemo, useState, type UIEvent } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';
import { DataMartIconGlyph } from './DataMartIconGlyph';
import {
  RECOMMENDED_ICON_OPTIONS,
  searchIconOptions,
  withoutRecommendedGlyphs,
  type IconPickerOption,
} from './data-mart-icon-search';
import { useLucideIconCatalog } from './use-lucide-icon-catalog';

/** Library tiles drawn at first; more are added as the list scrolls. */
const INITIAL_LIBRARY_TILES = 160;
const LIBRARY_TILES_STEP = 240;
/** How close to the bottom (px) the list grows. */
const GROW_THRESHOLD_PX = 240;

interface DataMartIconPickerProps {
  icon: DataMartIconValue | null;
  onChange: (icon: DataMartIconValue | null) => Promise<void>;
  className?: string;
}

/**
 * Icon tile beside the Data Mart title. It opens the recommended icons and,
 * below them, every icon of the library, with a search over both.
 */
export function DataMartIconPicker({ icon, onChange, className }: DataMartIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [libraryTiles, setLibraryTiles] = useState(INITIAL_LIBRARY_TILES);

  const catalog = useLucideIconCatalog(open);
  const libraryOptions = useMemo(
    () => (catalog ? withoutRecommendedGlyphs(catalog.LUCIDE_ICON_OPTIONS) : []),
    [catalog]
  );
  const isSearching = query.trim() !== '';
  const results = useMemo(
    () => searchIconOptions(query, RECOMMENDED_ICON_OPTIONS, libraryOptions),
    [query, libraryOptions]
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setLibraryTiles(INITIAL_LIBRARY_TILES);
    }
  };

  const pick = async (next: DataMartIconValue | null) => {
    handleOpenChange(false);
    if (next === icon) return;
    setIsSaving(true);
    try {
      await onChange(next);
    } finally {
      setIsSaving(false);
    }
  };

  const growOnScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < GROW_THRESHOLD_PX) {
      setLibraryTiles(tiles => tiles + LIBRARY_TILES_STEP);
    }
  };

  const renderGrid = (label: string, options: readonly IconPickerOption[]) => (
    <div className='grid grid-cols-8 gap-1' role='group' aria-label={label}>
      {options.map(({ value, label: optionLabel, icon: Icon }) => {
        const selected = value === icon;
        return (
          <button
            key={value}
            type='button'
            aria-pressed={selected}
            aria-label={optionLabel}
            title={optionLabel}
            onClick={() => void pick(value)}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]',
              selected && 'bg-primary/10 text-primary ring-primary/40 ring-1'
            )}
          >
            <Icon className='size-4' aria-hidden='true' />
          </button>
        );
      })}
    </div>
  );

  const sectionTitle = (title: string) => (
    <p className='text-muted-foreground mt-3 mb-1.5 px-1 text-xs font-medium first:mt-0'>{title}</p>
  );

  const loadingNote = <p className='text-muted-foreground px-1 py-2 text-sm'>Loading all icons…</p>;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className={cn(
            'bg-muted text-foreground hover:bg-accent focus-visible:ring-ring/50 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50',
            className
          )}
          aria-label='Change Data Mart icon'
          title='Change icon'
          disabled={isSaving}
          data-testid='dataMartIconPicker'
        >
          <DataMartIconGlyph icon={icon} className='size-5' aria-hidden='true' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-3'>
        <div className='relative mb-2'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4'
            aria-hidden='true'
          />
          <Input
            type='search'
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setLibraryTiles(INITIAL_LIBRARY_TILES);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && results.length > 0) {
                event.preventDefault();
                void pick(results[0].value);
              }
            }}
            placeholder='Search icons'
            aria-label='Search icons'
            autoFocus
            className='w-0 min-w-full pl-8 text-sm'
          />
        </div>
        <div
          className='-mr-1 max-h-[min(26rem,60vh)] overflow-y-auto pr-1'
          onScroll={growOnScroll}
          data-testid='dataMartIconPickerList'
        >
          {isSearching ? (
            results.length > 0 ? (
              renderGrid('Matching icons', results.slice(0, libraryTiles))
            ) : catalog ? (
              <p className='text-muted-foreground w-0 min-w-full px-1 py-2 text-sm'>
                No icons match “{query.trim()}”.
              </p>
            ) : (
              loadingNote
            )
          ) : (
            <>
              {sectionTitle('Recommended')}
              {renderGrid('Recommended icons', RECOMMENDED_ICON_OPTIONS)}
              {sectionTitle('All icons')}
              {catalog
                ? renderGrid('All icons', libraryOptions.slice(0, libraryTiles))
                : loadingNote}
            </>
          )}
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground mt-2 w-full justify-start'
          disabled={icon === null}
          onClick={() => void pick(null)}
        >
          <RotateCcw aria-hidden='true' />
          Reset to default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
