import { Inject, Injectable } from '@nestjs/common';
import type { StoredCredentialRequirement } from '../../data-marts/credentials/credential.types';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { PluginInstallationService } from './plugin-installation.service';

const BATCH_SIZE = 500;

/** Removes stale grants after a deployment-wide plugin version transition. */
@Injectable()
export class PluginCredentialBindingReconciliationService {
  constructor(
    private readonly installations: PluginInstallationService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly bindings: CredentialConsumerBindingFacade
  ) {}

  async reconcile(
    pluginId: string,
    requirements: readonly StoredCredentialRequirement[]
  ): Promise<void> {
    let afterId: string | null = null;
    for (;;) {
      const installations = await this.installations.listActiveByPluginIdAfter(
        pluginId,
        afterId,
        BATCH_SIZE
      );
      if (installations.length === 0) return;
      await this.bindings.reconcileBindings({
        consumerType: 'plugin-installation',
        consumerIds: installations.map(installation => installation.id),
        requirements,
      });
      afterId = installations.at(-1)!.id;
      if (installations.length < BATCH_SIZE) return;
    }
  }
}
