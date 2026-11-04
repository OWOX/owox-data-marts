import type { AuthorizationContext } from '../../../idp';
import type { StartCredentialSetupInput } from './credential-setup.dto';

export interface StartCredentialSetupCommand {
  readonly context: AuthorizationContext;
  readonly input: StartCredentialSetupInput;
}

export interface GetCredentialSetupCommand {
  readonly id: string;
  readonly context: AuthorizationContext;
}

export interface CompleteCredentialSetupCommand {
  readonly id: string;
  readonly context: AuthorizationContext;
  readonly credentialId: string;
}

export interface CancelCredentialSetupCommand {
  readonly id: string;
  readonly context: AuthorizationContext;
}

export interface WaitCredentialSetupCommand {
  readonly id: string;
  readonly context: AuthorizationContext;
  readonly waitSeconds?: number;
  readonly signal?: AbortSignal;
}
