import type { CustomConnectorActor } from './mcp-custom-connectors.dto';

export interface ConnectorMutationRequest extends CustomConnectorActor {
  connectorId: string;
  expectedRevision: number;
}
export interface ConnectorOperationRequest extends ConnectorMutationRequest {
  operationId: string;
}
export interface ConnectorCreateRequest extends CustomConnectorActor {
  operationId: string;
  name: string;
  title: string;
  manifest: Record<string, unknown>;
  preparationId?: string;
}
export interface ConnectorMetadataRequest extends ConnectorMutationRequest {
  title?: string;
  description?: string | null;
  docUrl?: string | null;
}
export interface ConnectorDraftRequest extends ConnectorMutationRequest {
  manifest: Record<string, unknown>;
  preparationId: string;
}
export interface ConnectorPublishRequest extends ConnectorOperationRequest {
  version: number;
  preparationId: string;
  impactDigest: string;
}
export interface ConnectorActivateRequest extends ConnectorOperationRequest {
  version: number;
  impactDigest: string;
}
export interface ConnectorDeleteRequest extends ConnectorOperationRequest {
  impactDigest: string;
}
export interface ConnectorTestRequest extends ConnectorOperationRequest {
  version: number;
  approvalId: string;
  node: string;
  maxRows: number;
  maxPages: number;
  timeoutMs: number;
}
export interface ConnectorMutationResult {
  connectorId: string;
  revision: number;
  outcome: 'completed' | 'incomplete' | 'unknown' | 'app_action_required';
  appAction?: {
    projectId: string;
    connectorId: string;
    reason: 'manifest_preparation_required' | 'test_credentials_approval_required';
    appUrl: string;
    operation: string;
  };
  version?: number;
  deleted?: boolean;
  test?: {
    state: 'succeeded' | 'failed';
    rowCount: number;
    diagnostic: 'test_succeeded' | 'test_failed';
  };
}
export interface ConnectorPreparationRequest extends CustomConnectorActor {
  connectorId: string;
  expectedRevision: number;
  version: number;
  protectedPaths: string[][];
  reviewedNonSecretContent: true;
}
export interface ConnectorTestApprovalRequest extends CustomConnectorActor {
  connectorId: string;
  expectedRevision: number;
  version: number;
  configuration: Record<string, unknown>;
}
export interface ConnectorPreparationResult {
  preparationId: string;
  revision: number;
  version: number;
  manifest: Record<string, unknown>;
  expiresAt: string;
}
