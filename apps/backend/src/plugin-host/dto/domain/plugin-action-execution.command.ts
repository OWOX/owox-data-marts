import { AuthorizationContext } from '../../../idp/types/auth.types';

export class StartPluginActionExecutionCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly action: string,
    /** Undefined when the request body has no `input`; stored as null. */
    readonly input: unknown
  ) {}
}

export class GetPluginActionExecutionCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string,
    /** 0 answers at once. */
    readonly waitSeconds: number,
    /** Aborts when the request closes. */
    readonly signal: AbortSignal
  ) {}
}

export class CancelPluginActionExecutionCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string
  ) {}
}

export class GetCurrentPluginActionExecutionCommand {
  constructor(
    readonly context: AuthorizationContext,
    /** The calling SDK can use AI Credential handles. */
    readonly aiCredentials?: boolean
  ) {}
}
