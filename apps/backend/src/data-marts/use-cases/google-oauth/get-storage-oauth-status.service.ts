import { Injectable } from '@nestjs/common';
import { GetStorageOAuthStatusCommand } from '../../dto/domain/google-oauth/get-storage-oauth-status.command';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { DataStorageCredentialService } from '../../services/data-storage-credential.service';
import { DataStorageService } from '../../services/data-storage.service';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';

@Injectable()
export class GetStorageOAuthStatusService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageCredentialService: DataStorageCredentialService
  ) {}

  async run(command: GetStorageOAuthStatusCommand): Promise<GoogleOAuthStatusResponseDto> {
    const storage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.storageId
    );

    if (!storage.credentialId) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const credential = await this.dataStorageCredentialService.getById(storage.credentialId);
    if (!credential || credential.type !== StorageCredentialType.GOOGLE_OAUTH) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const isValid = !!(credential.credentials as { refresh_token?: string }).refresh_token;
    return {
      isValid,
      user: credential.identity || undefined,
      credentialId: credential.id,
    };
  }
}
