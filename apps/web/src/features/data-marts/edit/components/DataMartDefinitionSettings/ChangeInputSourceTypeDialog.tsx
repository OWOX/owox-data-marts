import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import { DataMartDefinitionType } from '../../../shared';
import type { InputSourceChangeImpact } from './useInputSourceChangeImpact';

const TYPE_LABELS: Record<DataMartDefinitionType, string> = {
  [DataMartDefinitionType.SQL]: 'SQL',
  [DataMartDefinitionType.TABLE]: 'Table',
  [DataMartDefinitionType.VIEW]: 'View',
  [DataMartDefinitionType.TABLE_PATTERN]: 'Pattern',
  [DataMartDefinitionType.CONNECTOR]: 'Connector',
};

interface ChangeInputSourceTypeDialogProps {
  open: boolean;
  fromType: DataMartDefinitionType;
  toType: DataMartDefinitionType;
  impact: InputSourceChangeImpact | null;
  isLoadingImpact: boolean;
  /** The impact read failed — dependencies are unknown, not zero. */
  impactFailed: boolean;
  onRetryImpact: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function pluralize(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

function describeImpact(impact: InputSourceChangeImpact): string | null {
  const relationships = impact.inboundRelationships + impact.outboundRelationships;
  const parts: string[] = [];

  if (relationships > 0) {
    parts.push(pluralize(relationships, 'relationship'));
  }
  if (impact.reports > 0) {
    parts.push(pluralize(impact.reports, 'report'));
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' and ');
}

export function ChangeInputSourceTypeDialog({
  open,
  fromType,
  toType,
  impact,
  isLoadingImpact,
  impactFailed,
  onRetryImpact,
  onConfirm,
  onCancel,
}: ChangeInputSourceTypeDialogProps) {
  const dependants = impact ? describeImpact(impact) : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Change input source from {TYPE_LABELS[fromType]} to {TYPE_LABELS[toType]}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This Data Mart keeps its relationships, reports and field metadata. Fields that are
            missing from the new source will be marked as disconnected, and anything built on them
            will need attention.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* A failed read is "unknown", never "zero": the reassuring copy is reserved for a
            successful response that actually counted nothing. */}
        {isLoadingImpact ? (
          <p className='text-muted-foreground text-sm'>Checking what depends on this Data Mart…</p>
        ) : impactFailed ? (
          <p className='text-muted-foreground text-sm'>
            Couldn’t check what depends on this Data Mart. You can still proceed, or{' '}
            <button type='button' className='underline underline-offset-2' onClick={onRetryImpact}>
              try again
            </button>
            .
          </p>
        ) : impact ? (
          <p className='text-muted-foreground text-sm'>
            {dependants
              ? `${dependants} depend on this Data Mart.`
              : 'Nothing else depends on this Data Mart yet.'}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type='button' onClick={onConfirm}>
            Change input source
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type { ChangeInputSourceTypeDialogProps };
