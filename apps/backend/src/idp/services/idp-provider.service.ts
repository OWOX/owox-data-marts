import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as Express from 'express';
import { AuthenticationError, IdpProvider } from '@owox/idp-protocol';

@Injectable()
export class IdpProviderService {
  /**
   * Get the IDP provider from the request
   * @param request - The request object
   * @returns The IDP provider
   */
  getProvider(request: Request): IdpProvider {
    const app = request.app as Express.Application;
    const idpProvider: IdpProvider | undefined = app.get('idp') as IdpProvider;

    if (!idpProvider) {
      throw new AuthenticationError('No IDP provider found');
    }

    return idpProvider;
  }
}
