import type { BuilderManifest } from '../model/manifest.types';

export interface CustomConnectorListItemDto {
  id: string;
  name: string;
  title: string;
  description: string | null;
  logo: string | null;
  docUrl: string | null;
  activeVersionId: string | null;
  activeVersion?: number | null;
}

export interface CustomConnectorVersionSummaryDto {
  version: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
}

export interface PublishCustomConnectorResultDto
  extends CustomConnectorVersionSummaryDto, StoppingReport {
  /** What publishing found wrong with the manifest without refusing it; empty when nothing. */
  warnings: string[];
}

export interface CustomConnectorDetailDto extends CustomConnectorListItemDto {
  versions: CustomConnectorVersionSummaryDto[];
}

export interface CustomConnectorVersionDto {
  version: number;
  status: 'draft' | 'published';
  manifest: BuilderManifest;
}

export interface CreateCustomConnectorPayload {
  name: string;
  title: string;
  description?: string;
  logo?: string;
  docUrl?: string;
  manifest: BuilderManifest;
}

/** The Data Marts a new version leaves without a fitting Credential; some may be hidden from the caller. */
export interface StoppingReport {
  stoppingDataMarts: { id: string; title: string }[];
  hiddenStoppingCount: number;
}

export interface ActivateVersionResultDto extends StoppingReport {
  activeVersionId: string | null;
  activeVersion: number;
}

export interface ConnectorTestResultDto {
  rows: Record<string, unknown>[];
  logs: string[];
  error: string | null;
  sample?: Record<string, unknown>[];
}

/** Which Credentials fit a published connector (at the version a Data Mart runs) or a manifest in the editor. */
export interface FittingCredentialsQuery {
  connectorName?: string;
  version?: number;
  manifest?: BuilderManifest;
  /** The node a test runs; only it is fitted. */
  node?: string;
  /** The selective authentication branch the configuration picks. */
  selection?: string;
}

/** What a new Credential must hold to fit, from the server's own manifest parse. */
export interface CredentialRequirementDto {
  hosts: string[];
  /** The selection's key parameters, generated ones aside; empty until a selective branch is picked. */
  fieldList: { key: string; label: string; secret: boolean; required: boolean }[];
  /** Every key parameter of every branch: a configuration never holds a value for one. */
  keyParameters: string[];
  selectionParameter?: string;
  /** The run error for each key parameter used where no request is built; absent from an older server. */
  misuse?: string[];
}

/** A Credential that fits, without its values. */
/** Why a listed Credential cannot be chosen for the manifest. */
export interface FittingCredentialRefusal {
  reason: 'unfit' | 'misuse' | 'secret';
  message: string;
}

export interface FittingCredentialDto {
  id: string;
  title: string;
  hosts: string[];
  fieldKeys: string[];
  /** Null when it fits. */
  refusal: FittingCredentialRefusal | null;
}

export interface TestConnectorPayload {
  manifest: BuilderManifest;
  node: string;
  configuration: Record<string, unknown>;
  /** Run on this Credential's values; the configuration then holds no key parameter. */
  credentialId?: string;
  maxRows?: number;
}
