import { useLayoutEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import type { LogCategory } from './log-category';
import { getCategoryIcon } from './icons';
import { countChipsThatFit } from './chips-fit';

export interface CategoryFilter {
  category: LogCategory;
  label: string;
  count: number;
}

// Tailwind `gap-2`, the spacing between chips and before the overflow button.
const CHIP_GAP_PX = 8;

const CHIP_CLASSES =
  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';

function chipClasses(isActive: boolean): string {
  return `${CHIP_CLASSES} ${
    isActive
      ? 'border-border bg-accent text-foreground'
      : 'border-border text-muted-foreground opacity-60 hover:opacity-100'
  }`;
}

interface CategoryChipsProps {
  filters: CategoryFilter[];
  activeCategories?: Set<LogCategory>;
  onToggle: (category: LogCategory) => void;
}

/**
 * The log category toggles, in one row that never scrolls: the chips that do not fit move
 * into a "+N" menu. Where nothing can measure the row, every chip is shown.
 */
export function CategoryChips({ filters, activeCategories, onToggle }: CategoryChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitting, setFitting] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const widths = Array.from(measure.children, child => (child as HTMLElement).offsetWidth);
      const overflowWidth = widths.pop() ?? 0;
      setFitting(countChipsThatFit(widths, row.clientWidth, CHIP_GAP_PX, overflowWidth));
    });
    observer.observe(row);
    return () => {
      observer.disconnect();
    };
  }, [filters]);

  const shown = Math.min(fitting ?? filters.length, filters.length);
  const overflow = filters.slice(shown);
  const isActive = (category: LogCategory) => activeCategories?.has(category) ?? true;

  return (
    // A fixed basis, not the chips' own width: it decides whether the row stays beside the search
    // or wraps under it, and a basis that changed with the chips shown would move it back and forth.
    <div
      ref={rowRef}
      className='relative flex min-w-0 grow basis-36 items-center gap-2 overflow-hidden'
    >
      {/* Every chip at its natural width, and the widest overflow button: the row is fitted
          from these, whichever of them are on show. */}
      <div
        ref={measureRef}
        aria-hidden='true'
        className='pointer-events-none invisible absolute top-0 left-0 flex gap-2'
      >
        {filters.map(({ category, label, count }) => (
          <span key={category} className={chipClasses(true)}>
            {getCategoryIcon(category)}
            <span>{label}</span>
            <span>{count}</span>
          </span>
        ))}
        <span className={chipClasses(true)}>+{filters.length}</span>
      </div>

      {filters.slice(0, shown).map(({ category, label, count }) => (
        <button
          key={category}
          type='button'
          onClick={e => {
            e.stopPropagation();
            onToggle(category);
          }}
          aria-pressed={isActive(category)}
          className={chipClasses(isActive(category))}
        >
          {getCategoryIcon(category)}
          <span>{label}</span>
          <span className='text-muted-foreground'>{count}</span>
        </button>
      ))}

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              aria-label={`${String(overflow.length)} more log types`}
              onClick={e => {
                e.stopPropagation();
              }}
              className={chipClasses(overflow.some(({ category }) => isActive(category)))}
            >
              +{overflow.length}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='start'
            onClick={e => {
              e.stopPropagation();
            }}
          >
            {overflow.map(({ category, label, count }) => (
              <DropdownMenuCheckboxItem
                key={category}
                aria-label={label}
                checked={isActive(category)}
                onCheckedChange={() => {
                  onToggle(category);
                }}
                onSelect={e => {
                  e.preventDefault();
                }}
                className='gap-1.5 text-xs'
              >
                {getCategoryIcon(category)}
                <span>{label}</span>
                <span className='text-muted-foreground ml-auto'>{count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
