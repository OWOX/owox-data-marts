import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialConsumerTitlesService } from '../services/credential-consumer-titles.service';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';

@Injectable()
export class ListCredentialsService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService,
    private readonly consumerTitles: CredentialConsumerTitlesService
  ) {}

  async run(context: AuthorizationContext): Promise<CredentialDto[]> {
    const credentials = await this.credentials.listByProjectId(context.projectId);
    const decide = (action: Action, ids: string[]) =>
      this.access.canAccessMany(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        ids,
        action,
        context.projectId
      );
    const canSee = await decide(
      Action.SEE,
      credentials.map(credential => credential.id)
    );
    const visible = credentials.filter(credential => canSee.get(credential.id) === true);
    const visibleIds = visible.map(credential => credential.id);
    const [canUse, bindings] = await Promise.all([
      decide(Action.USE, visibleIds),
      this.credentials.listBindingsOf(visibleIds),
    ]);
    const titles = await this.consumerTitles.visibleTitles(context, bindings);
    return Promise.all(
      visible.map(credential =>
        this.view.build(credential, context, undefined, {
          canUse: canUse.get(credential.id) === true,
          bindings: bindings.filter(binding => binding.credentialId === credential.id),
          titles,
        })
      )
    );
  }
}
