import { trackEvent } from '../../utils/data-layer';

export type McpPromoPlacement =
  | 'sidebar_connect'
  | 'create_data_mart'
  | 'data_setup_toast'
  | 'data_setup_card'
  | 'data_setup_card_maintain'
  | 'overview_card'
  | 'storage_sheet'
  | 'storage_sheet_maintain'
  | 'data_setup_storage_hint'
  | 'destination_sheet'
  | 'destination_sheet_maintain'
  | 'credential_sheet'
  | 'context_sheet'
  | 'context_sheet_maintain'
  | 'connector_builder'
  | 'connector_builder_maintain'
  | 'report_sheet'
  | 'report_sheet_maintain'
  | 'empty_project'
  | 'reports_hint'
  | 'reports_promo'
  | 'destinations_tab_card'
  | 'destinations_empty_tab'
  | 'setup_checklist';
export type McpPart = 'consumption' | 'setup' | 'both';
export type McpPromoMode = 'prompt' | 'connector';
export type McpPromoAction = 'claude' | 'chatgpt' | 'copy' | 'docs' | 'details';
export interface McpPromoEventContext {
  placement: McpPromoPlacement;
  mcpPart: McpPart;
  mode: McpPromoMode;
}

function track(
  event: 'mcp_promo_shown' | 'mcp_promo_clicked',
  ctx: McpPromoEventContext,
  action?: McpPromoAction
): void {
  trackEvent({
    event,
    category: 'McpPromo',
    action: action ? 'Clicked' : 'Shown',
    label: ctx.placement,
    context: ctx.mcpPart,
    value: action ?? null,
    error: null,
    details: JSON.stringify({
      surface: 'web_app',
      placement: ctx.placement,
      mcp_part: ctx.mcpPart,
      mode: ctx.mode,
      action,
    }),
  });
}

export function trackMcpPromoShown(ctx: McpPromoEventContext): void {
  track('mcp_promo_shown', ctx);
}

export function trackMcpPromoClicked(ctx: McpPromoEventContext & { action: McpPromoAction }): void {
  track('mcp_promo_clicked', ctx, ctx.action);
}
