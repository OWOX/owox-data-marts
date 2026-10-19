import type { ConnectorPreparationResult } from './connector-authoring.dto';
export interface CustomConnectorActor {
  projectId: string;
  userId: string;
  roles: string[];
}
export interface CustomConnectorListRequest extends CustomConnectorActor {
  limit: number;
  offset: number;
}
export interface CustomConnectorSetupRequest extends CustomConnectorActor {
  connectorId: string;
  versionsLimit: number;
  versionsOffset: number;
  activationVersion?: number;
}
export interface CustomConnectorValidationRequest extends CustomConnectorActor {
  connectorId: string;
  version: number;
}
export interface CustomConnectorMetadataDto {
  id: string;
  name: string;
  title: string;
  description: string | null;
  docUrl: string | null;
  activeVersion: number | null;
  revision: number;
  appUrl: string;
}
export interface CustomConnectorVersionDto {
  version: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  active: boolean;
}
export interface CustomConnectorConsumerDto {
  id: string;
  title: string;
  pinnedVersion: number | null;
  affectedByActivation: boolean;
  canEdit: boolean | null;
}
export interface CustomConnectorImpactDto {
  activationVersion: number | null;
  activationDigest: string | null;
  deletionDigest: string;
  referencedConsumers: number;
  unpinnedConsumers: number;
  pinnedConsumers: number;
  hiddenConsumers: number;
  hasEditAccessToAllUnpinnedConsumers: boolean;
  deletionBlockedByReferences: boolean;
  visibleConsumers: CustomConnectorConsumerDto[];
  visibleConsumersTruncated: boolean;
}
export interface CustomConnectorListDto {
  items: CustomConnectorMetadataDto[];
  hasMore: boolean;
}
export interface CustomConnectorSetupDto {
  connector: CustomConnectorMetadataDto;
  versions: CustomConnectorVersionDto[];
  hasMoreVersions: boolean;
  editing: {
    state: 'preparation_required' | 'prepared';
    revision: number;
    editableDraft: ConnectorPreparationResult | null;
  };
  testApproval: { approvalId: string; revision: number; version: number; expiresAt: string } | null;
  impact: CustomConnectorImpactDto;
}
export type ConnectorManifestIssueCode =
  | 'manifest_too_large'
  | 'metadata_too_large'
  | 'source_name_mismatch'
  | 'literal_auth_secret'
  | 'secret_parameter_value'
  | 'secret_parameter_required'
  | 'manifest_invalid'
  | 'primary_key_required'
  | 'runtime_schema_invalid';
export interface ConnectorManifestIssueDto {
  code: ConnectorManifestIssueCode;
  message: string;
}
export interface CustomConnectorValidationDto {
  revision: number;
  connectorId: string;
  version: number;
  status: 'draft' | 'published';
  valid: boolean;
  assessment: 'static_known_positions_only';
  issues: ConnectorManifestIssueDto[];
}
export interface ConnectorAuthoringSchemaDto {
  format: 'owox-declarative-manifest';
  maxManifestBytes: number;
  requiredManifestKeys: string[];
  sourceName: { pattern: string; maxLength: number; mutable: false };
  authenticationTypes: string[];
  credentials: {
    parameterAttribute: 'SECRET';
    literalAuthValuesAllowed: false;
    secretParameterDefaultsAllowed: false;
  };
  versions: { publishedImmutable: true; draftSaveChangesActiveVersion: false };
  safeEditingAvailable: true;
  approvedTestBindingAvailable: true;
  revisionAvailable: true;
  appUrl: string;
}
