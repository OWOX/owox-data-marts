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

export interface InspectCredentialConsumerRequest {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly consumerType: 'plugin-installation';
  readonly consumerId: string;
  readonly requirements: readonly StoredCredentialRequirement[];
}

export interface CredentialConsumerReadiness {
  readonly configured: boolean;
  /** Stored configuration and permission checks cannot establish current provider validity. */
  readonly providerValidity: 'unknown';
  readonly requirements: readonly {
    readonly key: string;
    readonly optional: boolean;
    readonly state: 'configured' | 'missing' | 'inaccessible' | 'incompatible';
  }[];
}

export interface CredentialConsumerBindingFacade {
  inspectConsumerReadiness(
    request: InspectCredentialConsumerRequest
  ): Promise<CredentialConsumerReadiness>;
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
