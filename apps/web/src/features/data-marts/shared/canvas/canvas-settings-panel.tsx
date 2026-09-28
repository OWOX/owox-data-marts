import { useId } from 'react';
import { Check, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Button } from '../../../../shared/components/Button';
import { CANVAS_DIRECTION_OPTIONS, type CanvasDirection } from './canvas-direction';
import {
  FIELD_ROW_PARTS,
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
  /** Unique id for the switch — two canvases may render this panel on one page. */
  joinFieldsSwitchId: string;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
  /** The checkboxes this canvas offers — only the parts its cards have, in menu order. */
  objectLabelOptions: readonly ObjectLabelOption[];
}

/**
 * The gear-popover content shared by the Models canvas and the Joinable Data
 * Marts diagram: view density, layout algorithm, join-field edge labels, what
 * each card shows and, in the Detailed view, what each field row shows. Every
 * checkbox hides exactly one thing. Purely presentational — persistence stays
 * with the owning canvas.
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
  // Field rows exist only in the Detailed view, so their options show only there.
  const fieldRowOptions =
    viewMode === 'erd'
      ? objectLabelOptions.filter(option => FIELD_ROW_PARTS.includes(option.part))
      : [];
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
      <PopoverTitle className='mt-3 border-t pt-3'>Card content</PopoverTitle>
      <ObjectLabelChecklist
        label='Card content'
        options={cardOptions}
        objectLabels={objectLabels}
        onObjectLabelsChange={onObjectLabelsChange}
      />
      {fieldRowOptions.length > 0 && (
        <>
          <PopoverTitle className='mt-3 border-t pt-3'>Field rows</PopoverTitle>
          <ObjectLabelChecklist
            label='Field rows'
            options={fieldRowOptions}
            objectLabels={objectLabels}
            onObjectLabelsChange={onObjectLabelsChange}
          />
        </>
      )}
    </>
  );
}

function ObjectLabelChecklist({
  label,
  options,
  objectLabels,
  onObjectLabelsChange,
}: {
  label: string;
  options: readonly ObjectLabelOption[];
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
}) {
  return (
    <div role='group' aria-label={label} className='mt-2 space-y-0.5'>
      {/* A checked box means the part is VISIBLE — unchecking hides it.
          The stored state is the hidden set, hence the inversion here. */}
      {options.map(({ part, label: optionLabel, helper }) => {
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
                {optionLabel}
              </span>
              <span className='text-muted-foreground text-xs leading-snug'>{helper}</span>
            </span>
          </button>
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
        className='max-h-(--radix-popover-content-available-height) w-64 overflow-y-auto'
      >
        <CanvasSettingsPanel {...props} joinFieldsSwitchId={joinFieldsSwitchId} />
      </PopoverContent>
    </Popover>
  );
}
