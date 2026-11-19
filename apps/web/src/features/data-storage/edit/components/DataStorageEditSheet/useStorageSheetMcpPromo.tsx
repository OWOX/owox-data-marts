import { useState, type ReactNode } from 'react';
import { useProjectRoute } from '../../../../../shared/hooks';
import { McpPromoCard, buildMcpPrompt, useIsMcpSetupPromoAvailable } from '../../../../mcp-promo';
import type { DataStorage } from '../../../shared/model/types/data-storage';
import { isDataStorageConfigValid } from '../../../shared/utils/storage-validation.utils';

/**
 * The AI assistant block for the Storage sheet: set up a new or unconfigured Storage,
 * maintain a configured one. Undefined when nothing renders, so the sheet keeps its
 * default focus.
 */
export function useStorageSheetMcpPromo(
  storage: DataStorage | null | undefined,
  isOpen: boolean,
  justCreated = false
): ReactNode | undefined {
  const { projectId } = useProjectRoute();
  const isAvailable = useIsMcpSetupPromoAvailable();
  // Take the Storage when the sheet opens (or when another Storage arrives while it is open) and keep
  // it until the next open: a save that completes the config, or the list clearing the Storage at
  // close, must not swap the block while the sheet animates out.
  const [opened, setOpened] = useState({ storage, justCreated, isOpen: false });
  const opening = isOpen && !opened.isOpen;
  const changed =
    isOpen &&
    !!storage &&
    (storage.id !== opened.storage?.id || justCreated !== opened.justCreated);
  if (opening || changed) setOpened({ storage, justCreated, isOpen: true });
  else if (!isOpen && opened.isOpen) setOpened({ ...opened, isOpen: false });
  const current = opening || changed ? { storage, justCreated } : opened;
  if (!projectId || !current.storage || !isAvailable) return undefined;

  const isSetup = current.justCreated || !isDataStorageConfigValid(current.storage);
  const placement = isSetup ? 'storage_sheet' : 'storage_sheet_maintain';
  return (
    <McpPromoCard
      key={placement}
      variant='section'
      placement={placement}
      mcpPart='setup'
      title={isSetup ? 'Set it up with your AI assistant' : 'Maintain it with your AI assistant'}
      prompt={buildMcpPrompt(placement, { projectId, storageId: current.storage.id })}
    />
  );
}
