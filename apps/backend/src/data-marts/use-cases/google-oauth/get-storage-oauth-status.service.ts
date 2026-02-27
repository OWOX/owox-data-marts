import { Injectable } from '@nestjs/common';
import { GetStorageOAuthStatusCommand } from '../../dto/domain/google-oauth/get-storage-oauth-status.command';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { DataStorageService } from '../../services/data-storage.service';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';

@Injectable()
export class GetStorageOAuthStatusService {
  constructor(private readonly dataStorageService: DataStorageService) {}

  async run(command: GetStorageOAuthStatusCommand): Promise<GoogleOAuthStatusResponseDto> {
    const storage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.storageId,
      { relations: ['credential'] }
    );

    if (!storage.credential) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    if (storage.credential.type !== StorageCredentialType.GOOGLE_OAUTH) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const isValid = !!(storage.credential.credentials as { refresh_token?: string }).refresh_token;
    return {
      isValid,
      user: storage.credential.identity || undefined,
      credentialId: storage.credential.id,
    };
  }
}
