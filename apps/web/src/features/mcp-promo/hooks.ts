import { type RefObject, useContext, useEffect, useRef } from 'react';
import { useAuth, useRole } from '../idp';
import { CollapsibleCardContext } from '../../shared/components/CollapsibleCard/CollapsibleCardContext';
import { type McpPromoEventContext, trackMcpPromoShown } from './analytics';

export function useIsMcpPromoAvailable(): boolean {
  return !!useAuth().user?.mcpServerUrl;
}

/** Product rule: setup blocks show only to admins and editors, not to Business Users. */
export function useIsMcpSetupPromoAvailable(): boolean {
  const { canEdit } = useRole();
  return useIsMcpPromoAvailable() && canEdit;
}

export function useMcpPromoShown(
  ctx: McpPromoEventContext,
  visible: boolean,
  sentRef?: RefObject<boolean>
): void {
  const ownSent = useRef(false);
  const sent = sentRef ?? ownSent;
  useEffect(() => {
    if (!visible || sent.current) return;
    sent.current = true;
    trackMcpPromoShown(ctx);
  }, [visible, ctx, sent]);
}

export function useMcpPromoShownWhenExpanded(
  ctx: McpPromoEventContext,
  enabled = true,
  sentRef?: RefObject<boolean>
): void {
  const { isCollapsed } = useContext(CollapsibleCardContext);
  useMcpPromoShown(ctx, enabled && !isCollapsed, sentRef);
}
