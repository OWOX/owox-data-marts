import { MCP_SETUP_GUIDE_URL } from './constants';
import type { McpPromoPlacement } from './analytics';

export type McpPromptPlacement = Extract<
  McpPromoPlacement,
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
>;

export interface McpPromptIds {
  projectId: string;
  dataMartId?: string;
  storageId?: string;
  destinationId?: string;
  contextId?: string;
  connectorId?: string;
  reportId?: string;
}

function required(value: string | undefined, name: string, placement: string): string {
  if (!value) throw new Error(`${name} is required for the ${placement} MCP prompt`);
  return value;
}

function task(placement: McpPromptPlacement, ids: McpPromptIds): string {
  const { projectId } = ids;
  switch (placement) {
    case 'create_data_mart':
      return `help me create a Data Mart in project ${projectId}.`;
    case 'data_setup_toast':
    case 'data_setup_card':
      return `help me finish the setup of Data Mart ${required(ids.dataMartId, 'dataMartId', placement)} in project ${projectId}. Do not create another Data Mart.`;
    case 'data_setup_card_maintain':
      return `help me maintain Data Mart ${required(ids.dataMartId, 'dataMartId', placement)} in project ${projectId}. Do not create another Data Mart.`;
    case 'overview_card':
      return `answer my questions with Data Mart ${required(ids.dataMartId, 'dataMartId', placement)} in project ${projectId}.`;
    case 'storage_sheet':
    case 'data_setup_storage_hint':
      return `help me finish configuring Storage ${required(ids.storageId, 'storageId', placement)} in project ${projectId}. Do not create another Storage.`;
    case 'storage_sheet_maintain':
      return `help me maintain Storage ${required(ids.storageId, 'storageId', placement)} in project ${projectId}. Do not create another Storage.`;
    case 'destination_sheet':
      return `help me add a Destination to project ${projectId}.`;
    case 'destination_sheet_maintain':
      return `help me maintain Destination ${required(ids.destinationId, 'destinationId', placement)} in project ${projectId}. Do not create another Destination.`;
    case 'credential_sheet':
      return `help me add a Credential to project ${projectId}.`;
    case 'context_sheet':
      return `help me create a Context in project ${projectId}.`;
    case 'context_sheet_maintain':
      return `help me maintain Context ${required(ids.contextId, 'contextId', placement)} in project ${projectId}. Do not create another Context.`;
    case 'connector_builder':
      return ids.connectorId
        ? `help me finish the custom connector ${ids.connectorId} in project ${projectId}. Do not create another custom connector.`
        : `help me build a custom connector in project ${projectId}.`;
    case 'connector_builder_maintain':
      return `help me maintain the custom connector ${required(ids.connectorId, 'connectorId', placement)} in project ${projectId}. Do not create another custom connector.`;
    case 'report_sheet':
      return `help me create a report for Data Mart ${required(ids.dataMartId, 'dataMartId', placement)} in Destination ${required(ids.destinationId, 'destinationId', placement)} in project ${projectId}.`;
    case 'report_sheet_maintain':
      return `help me maintain report ${required(ids.reportId, 'reportId', placement)} of Data Mart ${required(ids.dataMartId, 'dataMartId', placement)} in project ${projectId}. Do not create another report.`;
    case 'empty_project':
      return `help me set up my first Data Mart in project ${projectId}.`;
  }
}

export function buildMcpPrompt(placement: McpPromptPlacement, ids: McpPromptIds): string {
  return `Use the OWOX Data Marts connector to ${task(placement, ids)} First check that the connector uses this project. If the connector is not connected, help me connect it with ${MCP_SETUP_GUIDE_URL}`;
}

export function claudeNewChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

export function chatGptNewChatUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

export function setupGuideUrl(
  placement: McpPromoPlacement,
  utm?: { medium: string; campaign: string }
): string {
  const url = new URL(MCP_SETUP_GUIDE_URL);
  url.searchParams.set('utm_source', 'owox_data_marts');
  url.searchParams.set('utm_medium', utm?.medium ?? placement);
  url.searchParams.set('utm_campaign', utm?.campaign ?? 'mcp_promo');
  return url.toString();
}
