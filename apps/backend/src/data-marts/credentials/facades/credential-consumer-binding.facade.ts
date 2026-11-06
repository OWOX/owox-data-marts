import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CredentialDefinitionContract,
  StoredCredentialRequirement,
  CredentialSecret,
  NormalizedCredentialRequirement,
} from '../credential.types';

export const CREDENTIAL_CONSUMER_BINDING_FACADE = Symbol('CREDENTIAL_CONSUMER_BINDING_FACADE');

/** How readiness refuses a Credential that is not usable, as opposed to a real failure. */
export function isExpectedUnusableCredentialError(error: unknown): boolean {
  return (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  );
}

export interface ReplaceCredentialBindingsRequest {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly consumerType: 'plugin-installation';
  readonly consumerId: string;
  readonly requirements: readonly StoredCredentialRequirement[];
  readonly selections: Readonly<Record<string, string | null | undefined>>;
}

export interface ResolveCredentialBindingRequest {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly consumerType: 'plugin-installation';
  readonly consumerId: string;
  readonly requirement: StoredCredentialRequirement;
}

export interface ResolvedCredentialBinding {
  readonly credentialId: string;
  readonly requirement: NormalizedCredentialRequirement;
  readonly secret: CredentialSecret;
  readonly definition: CredentialDefinitionContract;
  readonly aiModelMappings: Readonly<Record<string, string>> | null;
}

export interface MarkCredentialUsedRequest {
  readonly credentialId: string;
  readonly consumerType: 'plugin-installation';
  readonly consumerId: string;
  readonly requirementKey: string;
}

export interface ReconcileCredentialBindingsRequest {
  readonly consumerType: 'plugin-installation';
  readonly consumerIds: readonly string[];
  readonly requirements: readonly StoredCredentialRequirement[];
}

export interface ListCredentialSelectionsRequest {
  readonly projectId: string;
  readonly consumerType: 'plugin-installation';
  readonly consumerId: string;
  /** The requirements declared now; a binding made for another shape of one is no grant. */
  readonly requirements: readonly StoredCredentialRequirement[];
}

export interface CredentialConsumerBindingFacade {
  replaceBindings(request: ReplaceCredentialBindingsRequest): Promise<void>;
  /**
   * The consumer's active grants made for the current shape of each requirement, requirement
   * key to Credential id. The Credential itself may since have been disabled or lost to the
   * member: runtime refuses those, and the UI marks them as no longer usable.
   */
  listSelections(
    request: ListCredentialSelectionsRequest
  ): Promise<Readonly<Record<string, string>>>;
  deactivateConsumer(consumerType: 'plugin-installation', consumerId: string): Promise<void>;
  resolveBinding(request: ResolveCredentialBindingRequest): Promise<ResolvedCredentialBinding>;
  assertConsumerReady(request: {
    readonly projectId: string;
    readonly userId: string;
    readonly roles: readonly string[];
    readonly consumerType: 'plugin-installation';
    readonly consumerId: string;
    readonly requirements: readonly StoredCredentialRequirement[];
  }): Promise<readonly NormalizedCredentialRequirement[]>;
  reconcileBindings(request: ReconcileCredentialBindingsRequest): Promise<void>;
  markUsed(request: MarkCredentialUsedRequest): Promise<void>;
}
