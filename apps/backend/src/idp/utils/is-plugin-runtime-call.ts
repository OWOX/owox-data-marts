import type { ClsService } from 'nestjs-cls';
import { AUTH_CONTEXT } from '../guards/idp.guard';

/** True when IdpGuard recorded a plugin token for the current request. */
export function isPluginRuntimeCall(cls: ClsService | undefined): boolean {
  if (!cls?.isActive()) return false;
  return cls.get<{ authFlow?: string }>(AUTH_CONTEXT)?.authFlow === 'plugin';
}
