import { useId } from 'react';
import { Check, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Button } from '../../../../shared/components/Button';
import { CANVAS_DIRECTION_OPTIONS, type CanvasDirection } from './canvas-direction';
import {
  ALL_HIDDEN,
  isAllHidden,
  isNothingHidden,
  NOTHING_HIDDEN,
  OBJECT_LABEL_PARTS,
  toggleObjectLabelPart,
  type ObjectLabelPart,
  type ObjectLabelsHidden,
} from './object-labels';
import { VIEW_MODE_OPTIONS, type CanvasViewMode } from './view-mode';

const OBJECT_LABEL_META: Record<ObjectLabelPart, { label: string; helper: string }> = {
  source: {
    label: 'Input source',
    helper: 'The source badge (VIEW / TABLE / SQL / PATTERN / CONNECTOR)',
  },
  fields: {
    label: 'Field count',
    helper: 'The field count shown on each object',
  },
  status: {
    label: 'Status',
    helper: 'The published/draft indicator',
  },
};

export interface CanvasSettingsPanelProps {
  viewMode: CanvasViewMode;
  onViewModeChange: (next: CanvasViewMode) => void;
  direction: CanvasDirection;
  onDirectionChange: (next: CanvasDirection) => void;
  showJoinFields: boolean;
  onShowJoinFieldsChange: (checked: boolean) => void;
  /** Unique id for the switch — two canvases may render this panel on one page. */
  joinFieldsSwitchId: string;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
}

/**
 * The gear-popover content shared by the Models canvas and the Joinable Data
 * Marts diagram: view density, layout algorithm, join-field edge labels and
 * the object-labels checklist. Purely presentational — persistence stays with
 * the owning canvas.
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
}: CanvasSettingsPanelProps) {
  return (
    <>
      <PopoverTitle>View</PopoverTitle>
      <div
        role='radiogroup'
        aria-label='Card view mode'
        className='bg-muted mt-2 grid grid-cols-2 gap-0.5 rounded-md p-0.5'
      >
        {VIEW_MODE_OPTIONS.map(option => (
          <button
            key={option.value}
            type='button'
            role='radio'
            aria-checked={viewMode === option.value}
            className={`rounded px-2 py-1 text-sm transition-colors ${
              viewMode === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              onViewModeChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <PopoverTitle className='mt-3 border-t pt-3'>Layout algorithm</PopoverTitle>
      <div role='radiogroup' aria-label='Layout algorithm' className='mt-2 space-y-0.5'>
        {CANVAS_DIRECTION_OPTIONS.map(option => (
          <button
            key={option.value}
            type='button'
            role='radio'
            aria-checked={direction === option.value}
            className='hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm'
            onClick={() => {
              onDirectionChange(option.value);
            }}
          >
            <span>{option.label}</span>
            {direction === option.value && <Check className='h-4 w-4' />}
          </button>
        ))}
      </div>
      <div className='mt-3 flex items-center justify-between gap-2 border-t pt-3'>
        <label htmlFor={joinFieldsSwitchId} className='text-sm'>
          Show join fields
        </label>
        <Switch
          id={joinFieldsSwitchId}
          checked={showJoinFields}
          onCheckedChange={onShowJoinFieldsChange}
        />
      </div>
      <PopoverTitle className='mt-3 border-t pt-3'>Object labels</PopoverTitle>
      <p className='text-muted-foreground mt-1 text-xs leading-snug'>
        Tick what every object shows — untick to hide it.
      </p>
      <div className='mt-2 space-y-0.5'>
        {/* A checked box means the part is VISIBLE — unchecking hides it.
            The stored state is the hidden set, hence the inversion here. */}
        {OBJECT_LABEL_PARTS.map(part => {
          const meta = OBJECT_LABEL_META[part];
          const shown = !objectLabels[part];
          return (
            <button
              key={part}
              type='button'
              role='checkbox'
              aria-checked={shown}
              className='hover:bg-muted flex w-full items-start gap-2 rounded px-2 py-1.5 text-left'
              onClick={() => {
                onObjectLabelsChange(toggleObjectLabelPart(objectLabels, part));
              }}
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                  shown
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-transparent'
                }`}
                aria-hidden='true'
              >
                <Check className='h-2.5 w-2.5' strokeWidth={3.5} />
              </span>
              <span className='flex min-w-0 flex-col'>
                <span
                  className={`text-sm font-medium ${shown ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {meta.label}
                </span>
                <span className='text-muted-foreground text-xs leading-snug'>{meta.helper}</span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Both-ends shortcuts: tick everything back on, or clear it all. */}
      <div className='mt-1 space-y-0.5 border-t pt-1'>
        <button
          type='button'
          aria-pressed={isNothingHidden(objectLabels)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium ${
            isNothingHidden(objectLabels)
              ? 'bg-primary/10 text-primary'
              : 'text-foreground hover:bg-muted'
          }`}
          onClick={() => {
            onObjectLabelsChange(NOTHING_HIDDEN);
          }}
        >
          <span className='w-4 shrink-0 text-center font-bold' aria-hidden='true'>
            ≡
          </span>
          Check all — show everything
        </button>
        <button
          type='button'
          aria-pressed={isAllHidden(objectLabels)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium ${
            isAllHidden(objectLabels)
              ? 'bg-primary/10 text-primary'
              : 'text-foreground hover:bg-muted'
          }`}
          onClick={() => {
            onObjectLabelsChange(ALL_HIDDEN);
          }}
        >
          <span className='w-4 shrink-0 text-center font-bold' aria-hidden='true'>
            ⊘
          </span>
          Uncheck all — title only
        </button>
      </div>
    </>
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
      <PopoverContent align='end' side='left' className='w-56'>
        <CanvasSettingsPanel {...props} joinFieldsSwitchId={joinFieldsSwitchId} />
      </PopoverContent>
    </Popover>
  );
}
