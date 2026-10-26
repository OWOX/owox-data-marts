import { Injectable } from '@nestjs/common';
import { DataDestinationCredentialService } from './data-destination-credential.service';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';

@Injectable()
export class CopyCredentialService {
  constructor(private readonly destinationCredentialService: DataDestinationCredentialService) {}

  /**
   * Copies a credential from a source destination to a target destination.
   * If the target already has a credential, updates it. Otherwise, creates a new one.
   *
   * @returns The new credential ID if one was created, or undefined if an existing one was updated.
   */
  async copyDestinationCredential(
    projectId: string,
    existingCredentialId: string | null,
    source: DataDestinationCredential
  ): Promise<string | undefined> {
    if (existingCredentialId) {
      await this.destinationCredentialService.update(existingCredentialId, {
        type: source.type,
        credentials: source.credentials,
        identity: source.identity ?? null,
        expiresAt: source.expiresAt ?? null,
      });
      return undefined;
    }

    const newCred = await this.destinationCredentialService.create({
      projectId,
      type: source.type,
      credentials: source.credentials,
      identity: source.identity ?? null,
      expiresAt: source.expiresAt ?? null,
    });
    return newCred.id;
  }
}
