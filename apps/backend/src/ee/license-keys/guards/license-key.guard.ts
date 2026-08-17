import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  LICENSE_KEY_ID_HEADER,
  LICENSE_KEY_ISSUER,
  LicenseKeyClaims,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import {
  JwksUnavailableError,
  JwtPayload,
  verifyJwtClaims,
} from '../../../common/jwt-body/google-jwt-body.decorator';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyService } from '../services/license-key.service';

const VERIFIED_TOKEN_TTL_MS = 3600000;
const MARK_USED_THROTTLE_MS = 60000;

export interface LicensedRequest extends Request {
  licenseKey?: LicenseKey;
}

/**
 * Authenticates a self-managed deployment by its managed license key. Route-scoped:
 * these endpoints are never reached through project-member authentication.
 */
@Injectable()
export class LicenseKeyGuard implements CanActivate {
  /** Holds only signature-verified tokens, so size is bounded by issued license keys. */
  private readonly verifiedTokens = new Map<string, { claims: JwtPayload; until: number }>();

  constructor(private readonly licenseKeyService: LicenseKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LicensedRequest>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing license key');
    }

    const headerKeyId = request.headers[LICENSE_KEY_ID_HEADER.toLowerCase()];
    if (typeof headerKeyId !== 'string' || !headerKeyId) {
      throw new UnauthorizedException('Missing license key identifier');
    }

    const claims = await this.verify(authHeader.substring(7));
    if (claims.jti !== headerKeyId) {
      throw new UnauthorizedException('License key identifier does not match the license');
    }

    const license = claims.payload as LicenseKeyClaims | undefined;
    if (license?.projectBinding !== ProjectBinding.LICENSE) {
      throw new UnauthorizedException('This license binding cannot use the license gateway');
    }
    if (!license.billingProjectId) {
      throw new UnauthorizedException('License key is missing the billing project');
    }

    const record = await this.licenseKeyService.findActive(headerKeyId, license.billingProjectId);
    if (!record) {
      throw new UnauthorizedException('License key is revoked, expired, or unknown');
    }
    if (claims.aud !== record.origin) {
      throw new UnauthorizedException('License key was issued for a different origin');
    }

    if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > MARK_USED_THROTTLE_MS) {
      void this.licenseKeyService.markUsed(record.licenseKeyId).catch(() => undefined);
    }

    request.licenseKey = record;
    return true;
  }

  private async verify(token: string): Promise<JwtPayload> {
    const cached = this.verifiedTokens.get(token);
    if (cached && cached.until > Date.now()) {
      return cached.claims;
    }
    this.verifiedTokens.delete(token);

    try {
      const claims = await verifyJwtClaims(token, LICENSE_KEY_ISSUER);
      const expiresAtMs = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
      this.verifiedTokens.set(token, {
        claims,
        until: Math.min(expiresAtMs, Date.now() + VERIFIED_TOKEN_TTL_MS),
      });
      return claims;
    } catch (error) {
      if (error instanceof JwksUnavailableError) {
        throw new ServiceUnavailableException('License verification is temporarily unavailable');
      }
      throw new UnauthorizedException('License key is not valid');
    }
  }
}
