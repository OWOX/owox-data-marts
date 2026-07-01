import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AUTH_CONTEXT } from '../guards/idp.guard';

interface CachedAuthContext {
  userId?: string;
  projectId?: string;
}

/**
 * Defense-in-depth tenant boundary check.
 *
 * Use-cases that act on tenant-owned data must call `assertProject(projectId)`
 * with the project id derived from the request. The check compares it against
 * the authenticated project id stored in CLS by `IdpGuard`, so even if a
 * controller forgets to source the project id from the auth context (or a new
 * entry point is added in the future), the use-case still refuses to operate
 * on a different tenant.
 *
 * The check is a no-op when no CLS auth context is present — that path covers
 * background workers (queue processors, scheduled jobs) which legitimately
 * operate across projects without an HTTP request.
 */
@Injectable()
export class TenantGuardService {
  private readonly logger = new Logger(TenantGuardService.name);

  constructor(private readonly cls: ClsService) {}

  assertProject(projectId: string): void {
    if (!this.cls.isActive()) return;

    const authContext = this.cls.get<CachedAuthContext>(AUTH_CONTEXT);
    if (!authContext || !authContext.projectId) return;

    if (authContext.projectId !== projectId) {
      this.logger.warn(
        `Tenant boundary violation: auth projectId=${authContext.projectId} ` +
          `requested projectId=${projectId} userId=${authContext.userId ?? 'unknown'}`
      );
      throw new ForbiddenException('Project mismatch');
    }
  }
}
