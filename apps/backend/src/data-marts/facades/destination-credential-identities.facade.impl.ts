import { Injectable } from '@nestjs/common';
import { DestinationCredentialBindingService } from '../data-destination-types/destination-credential-binding.service';
import type { DestinationCredentialIdentitiesFacade } from './destination-credential-identities.facade';

@Injectable()
export class DestinationCredentialIdentitiesFacadeImpl implements DestinationCredentialIdentitiesFacade {
  constructor(private readonly destinationCredentials: DestinationCredentialBindingService) {}

  identitiesForDestinations(
    projectId: string,
    destinationIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>> {
    // A binding whose Credential was deleted names no one, and never falls back to the old row.
    return this.destinationCredentials.identitiesForDestinations(projectId, destinationIds, true);
  }
}
