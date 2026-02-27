import { Injectable } from '@nestjs/common';
import { RevokeStorageOAuthCommand } from '../../dto/domain/google-oauth/revoke-storage-oauth.command';
import { DataStorageService } from '../../services/data-storage.service';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';

@Injectable()
export class RevokeStorageOAuthService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService
  ) {}

  async run(command: RevokeStorageOAuthCommand): Promise<void> {
    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);
    await this.googleOAuthFlowService.revokeStorageOAuth(command.storageId);
  }
}
