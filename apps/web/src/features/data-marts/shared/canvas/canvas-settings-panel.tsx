import { useId, type ReactNode } from 'react';
import { Link2, Settings } from 'lucide-react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '../../../../shared/components/Button';
import { CANVAS_DIRECTION_OPTIONS, type CanvasDirection } from './canvas-direction';
import {
  ALL_HIDDEN,
  FIELD_ROW_PARTS,
  NOTHING_HIDDEN,
  toggleObjectLabelPart,
  type ObjectLabelOption,
  type ObjectLabelsHidden,
} from './object-labels';
import { VIEW_MODE_OPTIONS, type CanvasViewMode } from './view-mode';

export interface CanvasSettingsPanelProps {
  viewMode: CanvasViewMode;
  onViewModeChange: (next: CanvasViewMode) => void;
  direction: CanvasDirection;
  onDirectionChange: (next: CanvasDirection) => void;
  showJoinFields: boolean;
  onShowJoinFieldsChange: (checked: boolean) => void;
  /** Unique id prefix for the controls — two canvases may render this panel on one page. */
  joinFieldsSwitchId: string;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
  /** The checkboxes this canvas offers — only the parts its cards have, in menu order. */
  objectLabelOptions: readonly ObjectLabelOption[];
}

const VIEW_MODE_SUBTITLES: Record<CanvasViewMode, string> = {
  compact: 'Data Marts and joins',
  erd: 'Data Marts with their fields',
};

/** The small diagram on each view card: a Compact graph or cards with field rows. */
function ViewModeArt({ viewMode }: { viewMode: CanvasViewMode }) {
  return viewMode === 'erd' ? (
    <svg
      width='140'
      height='56'
      viewBox='0 0 140 56'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      aria-hidden='true'
    >
      <rect x='6' y='5' width='40' height='46' rx='4' />
      <path d='M6 15h40' />
      <path d='M12 23h24M12 31h18M12 39h26' strokeWidth='1' />
      <rect x='94' y='5' width='40' height='46' rx='4' />
      <path d='M94 15h40' />
      <path d='M100 23h22M100 31h26M100 39h16' strokeWidth='1' />
      <path d='M46 23 C70 23 70 31 94 31' />
      <circle cx='46' cy='23' r='2' fill='currentColor' />
      <circle cx='94' cy='31' r='2' fill='currentColor' />
    </svg>
  ) : (
    <svg
      width='140'
      height='56'
      viewBox='0 0 140 56'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      aria-hidden='true'
    >
      <rect x='6' y='18' width='36' height='20' rx='4' />
      <rect x='98' y='5' width='36' height='18' rx='4' />
      <rect x='98' y='33' width='36' height='18' rx='4' />
      <path d='M42 28 C70 28 70 14 98 14' />
      <path d='M42 28 C70 28 70 42 98 42' />
    </svg>
  );
}

function DirectionIcon({ direction }: { direction: CanvasDirection }) {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {direction === 'horizontal' ? (
        <>
          <rect x='2' y='9' width='6' height='6' rx='1.5' />
          <rect x='16' y='3' width='6' height='6' rx='1.5' />
          <rect x='16' y='15' width='6' height='6' rx='1.5' />
          <path d='M8 12h4M12 6v12M12 6h4M12 18h4' />
        </>
      ) : (
        <>
          <rect x='9' y='2' width='6' height='6' rx='1.5' />
          <rect x='3' y='16' width='6' height='6' rx='1.5' />
          <rect x='15' y='16' width='6' height='6' rx='1.5' />
          <path d='M12 8v4M6 12h12M6 12v4M18 12v4' />
        </>
      )}
    </svg>
  );
}

function SectionHeading({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`flex min-h-[22px] items-center gap-1.5 text-xs font-semibold tracking-[0.04em] uppercase ${
        muted ? 'text-muted-foreground/70' : 'text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * The gear-popover content shared by the Models canvas and the Joinable Data
 * Marts diagram: view density, layout algorithm, join-field edge labels, what
 * each card shows and what each field row shows. Every checkbox hides exactly
 * one thing. Purely presentational — persistence stays with the owning canvas.
 */
export function CanvasSettingsPanel({
  viewMode,
  onViewModeChange,
  direction,
  onDirectionChange,
  showJoinFields,
  onShowJoinFieldsChange,
  joinFieldsSwitchId,
  objectLabels,
  onObjectLabelsChange,
  objectLabelOptions,
}: CanvasSettingsPanelProps) {
  const cardOptions = objectLabelOptions.filter(option => !FIELD_ROW_PARTS.includes(option.part));
  const fieldRowOptions = objectLabelOptions.filter(option =>
    FIELD_ROW_PARTS.includes(option.part)
  );
  // Field rows exist only in the Detailed view, so their options wait for it.
  const fieldRowsDisabled = viewMode !== 'erd';

  return (
    <div className='flex flex-col gap-4'>
      <div role='radiogroup' aria-label='Card view mode' className='grid grid-cols-2 gap-2'>
        {VIEW_MODE_OPTIONS.map(option => {
          const selected = viewMode === option.value;
          const subtitleId = `${joinFieldsSwitchId}-view-${option.value}`;
          return (
            <button
              key={option.value}
              type='button'
              role='radio'
              aria-checked={selected}
              aria-label={option.label}
              aria-describedby={subtitleId}
              className={`flex cursor-pointer flex-col gap-2 rounded-[10px] border-2 p-2.5 text-left transition-colors ${
                selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
              onClick={() => {
                onViewModeChange(option.value);
              }}
            >
              <span
                className={`bg-background flex h-[60px] items-center justify-center rounded-md border ${
                  selected ? 'text-primary' : 'text-muted-foreground/60'
                }`}
              >
                <ViewModeArt viewMode={option.value} />
              </span>
              <span className='flex flex-col gap-0.5'>
                <span className='text-foreground text-sm font-semibold'>{option.label}</span>
                <span id={subtitleId} className='text-muted-foreground text-xs'>
                  {VIEW_MODE_SUBTITLES[option.value]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className='flex items-center gap-2'>
        <div
          role='radiogroup'
          aria-label='Layout algorithm'
          className='bg-muted flex gap-0.5 rounded-lg p-0.5'
        >
          {CANVAS_DIRECTION_OPTIONS.map(option => {
            const selected = direction === option.value;
            return (
              <button
                key={option.value}
                type='button'
                role='radio'
                aria-checked={selected}
                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors ${
                  selected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  onDirectionChange(option.value);
                }}
              >
                <DirectionIcon direction={option.value} />
                {option.label}
              </button>
            );
          })}
        </div>
        <span className='grow' />
        <button
          type='button'
          role='switch'
          aria-checked={showJoinFields}
          className={`inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${
            showJoinFields
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-background text-foreground hover:bg-muted/50'
          }`}
          onClick={() => {
            onShowJoinFieldsChange(!showJoinFields);
          }}
        >
          <Link2 className='h-[15px] w-[15px]' aria-hidden='true' />
          Show join fields
        </button>
      </div>

      <div className='bg-border h-px' />

      <div className='grid grid-cols-2 gap-4'>
        <ObjectLabelChecklist
          heading={<SectionHeading>Card content</SectionHeading>}
          label='Card content'
          idPrefix={`${joinFieldsSwitchId}-card`}
          options={cardOptions}
          objectLabels={objectLabels}
          onObjectLabelsChange={onObjectLabelsChange}
        />
        {fieldRowOptions.length > 0 && (
          <ObjectLabelChecklist
            heading={
              <SectionHeading muted={fieldRowsDisabled}>
                Field rows
                {fieldRowsDisabled && (
                  <span className='bg-muted text-muted-foreground rounded-lg px-1.5 py-px text-[10.5px] font-normal tracking-normal normal-case'>
                    Detailed only
                  </span>
                )}
              </SectionHeading>
            }
            label='Field rows'
            idPrefix={`${joinFieldsSwitchId}-rows`}
            options={fieldRowOptions}
            disabled={fieldRowsDisabled}
            objectLabels={objectLabels}
            onObjectLabelsChange={onObjectLabelsChange}
          />
        )}
      </div>

      {/* Both-ends shortcuts: show every part, or strip the cards to their titles. */}
      <div className='flex gap-2 border-t pt-2.5'>
        <button
          type='button'
          className='text-primary hover:bg-muted cursor-pointer rounded-md px-2 py-1.5 text-[13px]'
          onClick={() => {
            onObjectLabelsChange(NOTHING_HIDDEN);
          }}
        >
          Show all
        </button>
        <button
          type='button'
          className='text-primary hover:bg-muted cursor-pointer rounded-md px-2 py-1.5 text-[13px]'
          onClick={() => {
            onObjectLabelsChange(ALL_HIDDEN);
          }}
        >
          Title only
        </button>
      </div>
    </div>
  );
}

function ObjectLabelChecklist({
  heading,
  label,
  idPrefix,
  options,
  disabled = false,
  objectLabels,
  onObjectLabelsChange,
}: {
  heading: ReactNode;
  label: string;
  idPrefix: string;
  options: readonly ObjectLabelOption[];
  disabled?: boolean;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
}) {
  return (
    <div role='group' aria-label={label} className='flex min-w-0 flex-col gap-0.5'>
      {heading}
      {/* A checked box means the part is VISIBLE — unchecking hides it.
          The stored state is the hidden set, hence the inversion here. */}
      {options.map(({ part, label: optionLabel, helper }) => {
        const id = `${idPrefix}-${part}`;
        return (
          <label
            key={part}
            htmlFor={id}
            title={helper}
            className={`flex min-h-[34px] items-center gap-2 text-[13.5px] ${
              disabled
                ? 'text-muted-foreground/70 cursor-not-allowed'
                : 'text-foreground cursor-pointer'
            }`}
          >
            <Checkbox
              id={id}
              checked={!objectLabels[part]}
              disabled={disabled}
              onCheckedChange={() => {
                onObjectLabelsChange(toggleObjectLabelPart(objectLabels, part));
              }}
            />
            <span className='min-w-0 truncate'>{optionLabel}</span>
          </label>
        );
      })}
    </div>
  );
}

export type CanvasSettingsPopoverProps = Omit<CanvasSettingsPanelProps, 'joinFieldsSwitchId'>;

/**
 * The full gear control: trigger button + popover + settings panel. Both
 * canvases render this one component so the gear's affordance (icon, size,
 * aria-label, popover placement) can never drift between them.
 */
export function CanvasSettingsPopover(props: CanvasSettingsPopoverProps) {
  // Unique per instance — the inline and fullscreen canvases mount together.
  const joinFieldsSwitchId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='icon' className='h-12 w-12' aria-label='Canvas settings'>
          <Settings className='h-6 w-6' />
        </Button>
      </PopoverTrigger>
      {/* Scrolls when the window is shorter than the menu, so every option stays reachable. */}
      <PopoverContent
        align='end'
        side='left'
        collisionPadding={8}
        className='max-h-(--radix-popover-content-available-height) w-[400px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[14px] p-4'
      >
        <CanvasSettingsPanel {...props} joinFieldsSwitchId={joinFieldsSwitchId} />
      </PopoverContent>
    </Popover>
  );
}
