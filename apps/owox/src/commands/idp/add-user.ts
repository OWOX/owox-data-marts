import type { IdpProvider, IdpProviderAddUserCommand } from '@owox/idp-protocol';

import { Args, Flags } from '@oclif/core';

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
  static override examples = ['<%= config.bin %> idp add-user e.zapolskiy@owox.com'];
  static override flags = {
    ...BaseCommand.baseFlags,
    'idp-provider': Flags.string({
      default: 'better-auth',
      description: 'IDP provider to use (none, better-auth)',
      env: 'IDP_PROVIDER',
      options: ['none', 'better-auth'],
    }),
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IdpAddUser);

    this.initializeLogging(flags);
    const idpProvider = await IdpFactory.createFromEnvironment();
    await idpProvider.initialize();

    const email = args.email as string;
    if (providerSupportsAddUser(idpProvider)) {
      const user = await idpProvider.addUser(email);
      if (user.magicLink) {
        this.log(`🔗 Magic Link: ${user.magicLink}`);
      }
    } else {
      throw new Error('IDP provider does not support add-user command');
    }
  }
}
