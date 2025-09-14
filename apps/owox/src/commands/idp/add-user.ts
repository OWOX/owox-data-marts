import type { IdpProvider, IdpProviderAddUserCommand } from '@owox/idp-protocol';

import { Args } from '@oclif/core';

import { IdpFactory } from '../../idp/index.js';
import { BaseCommand } from '../base.js';

function providerSupportsAddUser(
  provider: IdpProvider
): provider is IdpProvider & IdpProviderAddUserCommand {
  return typeof (provider as unknown as { addUser?: unknown }).addUser === 'function';
}

export default class IdpAddUser extends BaseCommand {
  static override args = {
    email: Args.string({ description: 'Email of the user to add', required: true }),
  } as const;
  static override description = 'Add a user to the configured IDP (no-op: logs only)';
  static override examples = ['<%= config.bin %> idp add-user superadmin@gmail.com'];

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IdpAddUser);
    this.loadEnvironment(flags);

    const idpProvider = await IdpFactory.createFromEnvironment(this);
    await idpProvider.initialize();

    const email = args.email as string;
    if (providerSupportsAddUser(idpProvider)) {
      const user = await idpProvider.addUser(email);
      if (user.magicLink) {
        this.log(`Magic link: ${user.magicLink}`);
      }
    } else {
      this.error('IDP provider does not support add-user command');
    }
  }
}
