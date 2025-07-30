import { Injectable } from '@nestjs/common';
import { IIdpProvider } from '@owox/idp-protocol';
import { HttpAdapterHost } from '@nestjs/core';

@Injectable()
export class AuthService {
  private readonly idp: IIdpProvider;
  constructor(private readonly adapterHost: HttpAdapterHost) {
    this.idp = this.adapterHost.httpAdapter.getInstance().get('idp') as IIdpProvider;
  }
}
