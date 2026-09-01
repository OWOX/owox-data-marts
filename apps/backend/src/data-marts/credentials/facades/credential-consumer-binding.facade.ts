import type {
  CredentialDefinitionContract,
  StoredCredentialRequirement,
  CredentialSecret,
  NormalizedCredentialRequirement,
} from '../credential.types';

export const CREDENTIAL_CONSUMER_BINDING_FACADE = Symbol('CREDENTIAL_CONSUMER_BINDING_FACADE');

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

export interface CredentialConsumerBindingFacade {
  replaceBindings(request: ReplaceCredentialBindingsRequest): Promise<void>;
  deactivateConsumer(
    consumerType: 'plugin-installation',
    consumerId: string,
    projectId: string
  ): Promise<void>;
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
