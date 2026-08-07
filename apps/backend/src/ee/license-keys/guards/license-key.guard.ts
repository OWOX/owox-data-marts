import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import {
  LICENSE_KEY_ISSUER,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { verifyJwtClaims } from '../../../common/jwt-body/google-jwt-body.decorator';
import { LicenseKeyService } from '../services/license-key.service';

export const LICENSE_KEY_ID_HEADER = 'x-owox-license-key-id';

export interface LicensedRequest extends Request {
  licensedProjectId?: string;
}

interface GatewayLicenseClaims {
  licensedAppEdition?: string;
  projectBinding?: string;
  billingProjectId?: string;
}

/**
 * Authenticates a self-managed deployment by its managed license key. Route-scoped:
 * these endpoints are never reached through project-member authentication.
 */
@Injectable()
export class LicenseKeyGuard implements CanActivate {
  constructor(private readonly licenseKeyService: LicenseKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LicensedRequest>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing license key');
    }

    const headerKeyId = request.headers[LICENSE_KEY_ID_HEADER];
    if (typeof headerKeyId !== 'string' || !headerKeyId) {
      throw new UnauthorizedException('Missing license key identifier');
    }

    const claims = await this.verify(authHeader.substring(7));
    if (claims.jti !== headerKeyId) {
      throw new UnauthorizedException('License key identifier does not match the license');
    }

    const license = claims.payload as GatewayLicenseClaims | undefined;
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

    void this.licenseKeyService.markUsed(record.licenseKeyId).catch(() => undefined);

    request.licensedProjectId = record.projectId;
    return true;
  }

  private async verify(token: string) {
    try {
      return await verifyJwtClaims(token, LICENSE_KEY_ISSUER);
    } catch {
      throw new UnauthorizedException('License key is not valid');
    }
  }
}
