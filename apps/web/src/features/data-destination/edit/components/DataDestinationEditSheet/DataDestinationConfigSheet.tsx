import { type DataDestination, DataDestinationType } from '../../../shared';
import { DataDestinationForm } from '../DataDestinationEditForm';
import type { DataDestinationFormData } from '../../../shared';
import { useEffect, useRef } from 'react';
import { UnsavedChangesConfirmationDialog } from '../../../../../shared/components/UnsavedChangesConfirmationDialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { useDataDestination } from '../../../shared';
import { DestinationMapperFactory } from '../../../shared/model/mappers/destination-mapper.factory';
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../shared/hooks/useIntercomLauncher';

interface DataDestinationEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataDestination: DataDestination | null;
  onSaveSuccess: (dataDestination: DataDestination) => void;
  initialFormData?: DataDestinationFormData;
  allowedDestinationTypes?: DataDestinationType[];
}

export function DataDestinationConfigSheet({
  isOpen,
  onClose,
  dataDestination,
  onSaveSuccess,
  initialFormData,
  allowedDestinationTypes,
}: DataDestinationEditSheetProps) {
  const { updateDataDestination, createDataDestination } = useDataDestination();

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  useIntercomLauncher(isOpen);

  const onSave = async (
    data: DataDestinationFormData,
    source?: { id: string; title: string } | null
  ) => {
    const mapper = DestinationMapperFactory.getMapper(data.type);

    if (!dataDestination) {
      const { ownerIds, ...formFields } = data as DataDestinationFormData & { ownerIds?: string[] };
      if (source) {
        const createData = {
          title: formFields.title,
          type: formFields.type,
          sourceDestinationId: source.id,
          ...(ownerIds !== undefined && { ownerIds }),
        };
        const newDestination = await createDataDestination(createData);
        handleFormSubmitSuccess();
        if (newDestination) {
          onSaveSuccess(newDestination);
        }
      } else {
        const createData = {
          ...mapper.mapToCreateRequest(formFields),
          ...(ownerIds !== undefined && { ownerIds }),
        };
        const newDestination = await createDataDestination(createData);
        handleFormSubmitSuccess();
        if (newDestination) {
          onSaveSuccess(newDestination);
        }
      }
    } else {
      const { ownerIds, availableForUse, availableForMaintenance, contextIds, ...formFields } =
        data as DataDestinationFormData & {
          ownerIds?: string[];
          availableForUse?: boolean;
          availableForMaintenance?: boolean;
          contextIds?: string[];
        };
      const updateData = mapper.mapToUpdateRequest(formFields);
      const requestWithExtras = {
        ...updateData,
        ...(ownerIds !== undefined && { ownerIds }),
        ...(availableForUse !== undefined && { availableForUse }),
        ...(availableForMaintenance !== undefined && { availableForMaintenance }),
        ...(contextIds !== undefined && { contextIds }),
      };
      const updatedDestination = await updateDataDestination(dataDestination.id, requestWithExtras);
      handleFormSubmitSuccess();
      if (updatedDestination) {
        onSaveSuccess(updatedDestination);
      }
    }
  };

  const mode = dataDestination ? 'edit' : 'create';
  const wasOpenRef = useRef(false);

  // The Google Drive Picker renders its modal in document.body (outside this
  // Sheet's DOM), so interacting with it would be treated as an outside
  // interaction and close the Sheet. Keep the Sheet open while a Picker is
  // present (matched by the event target OR by any Picker node in the DOM).
  const PICKER_SELECTOR =
    '.picker-dialog, .picker-dialog-bg, .picker, .pac-container, iframe[src*="docs.google.com/picker"]';
  // The Picker does not always remove every node when it closes (a hidden
  // `.picker-dialog-bg` / iframe can linger). A blanket presence check would
  // then permanently keep the Sheet open on outside-click / focus-out, so only
  // a node that is actually visible counts.
  const isPickerNodeVisible = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) {
      return true;
    }
    const checkVisibility = (el as unknown as { checkVisibility?: (opts?: unknown) => boolean })
      .checkVisibility;
    if (
      typeof checkVisibility === 'function' &&
      !checkVisibility.call(el, { visibilityProperty: true, opacityProperty: true })
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const shouldKeepOpenForPicker = (target: EventTarget | null): boolean => {
    if (target instanceof Element && target.closest(PICKER_SELECTOR)) {
      return true;
    }
    return Array.from(document.querySelectorAll(PICKER_SELECTOR)).some(isPickerNodeVisible);
  };

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      trackEvent({
        event: 'data_destination_config_open',
        category: 'DataDestination',
        action: mode,
        label: dataDestination?.type,
      });
      wasOpenRef.current = true;
    } else if (!isOpen && wasOpenRef.current) {
      trackEvent({
        event: 'data_destination_config_close',
        category: 'DataDestination',
        action: mode,
        label: dataDestination?.type,
      });
      wasOpenRef.current = false;
    }
  }, [isOpen, dataDestination, mode]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent
        data-testid='destEditSheet'
        onPointerDownOutside={event => {
          if (shouldKeepOpenForPicker(event.detail.originalEvent.target)) {
            event.preventDefault();
          }
        }}
        onFocusOutside={event => {
          if (shouldKeepOpenForPicker(event.detail.originalEvent.target)) {
            event.preventDefault();
          }
        }}
        onInteractOutside={event => {
          if (shouldKeepOpenForPicker(event.detail.originalEvent.target)) {
            event.preventDefault();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>Configure destination</SheetTitle>
          <SheetDescription>Customize settings for your destination</SheetDescription>
        </SheetHeader>
        <DataDestinationForm
          initialData={dataDestination ?? initialFormData ?? null}
          onSubmit={onSave}
          onCancel={handleClose}
          onDirtyChange={handleFormDirtyChange}
          isEditMode={!!dataDestination}
          allowedDestinationTypes={allowedDestinationTypes}
          destinationId={dataDestination?.id}
        />
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
