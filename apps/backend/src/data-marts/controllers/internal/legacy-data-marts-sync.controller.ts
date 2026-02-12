import { Controller, Delete, HttpCode, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../../../common/guards/internal-api.guard';
import { Auth, Role } from '../../../idp';
import { DeleteLegacyDataMartCommand } from '../../dto/domain/legacy-data-marts/delete-legacy-data-mart.command';
import { SyncLegacyDataMartCommand } from '../../dto/domain/legacy-data-marts/sync-legacy-data-mart.command';
import { DeleteLegacyDataMartService } from '../../use-cases/legacy-data-marts/delete-legacy-data-mart.service';
import { SyncLegacyDataMartService } from '../../use-cases/legacy-data-marts/sync-legacy-data-mart.service';
import {
  DeleteLegacyDataMartSpec,
  SyncLegacyDataMartSpec,
} from '../spec/internal/legacy-data-marts-sync.api';

@UseGuards(InternalApiGuard)
@Controller('internal/legacy-data-marts-sync/:id')
export class LegacyDataMartsSyncController {
  private readonly logger = new Logger(LegacyDataMartsSyncController.name);

  constructor(
    private readonly syncLegacyDataMartService: SyncLegacyDataMartService,
    private readonly deleteDataMartService: DeleteLegacyDataMartService
  ) {}

  @Post()
  @HttpCode(204)
  @SyncLegacyDataMartSpec()
  @Auth(Role.none())
  syncDataMart(@Param('id') dataMartId: string): void {
    this.logger.log(`Syncing legacy data mart ${dataMartId}`);
    const command = new SyncLegacyDataMartCommand(dataMartId);
    this.syncLegacyDataMartService.run(command).catch(err => {
      this.logger.error(`Failed to sync legacy data mart ${dataMartId}`, err);
    });
  }

  @Delete()
  @HttpCode(204)
  @DeleteLegacyDataMartSpec()
  @Auth(Role.none())
  deleteDataMart(@Param('id') dataMartId: string): void {
    this.logger.log(`Deleting legacy data mart ${dataMartId}`);
    const command = new DeleteLegacyDataMartCommand(dataMartId);
    this.deleteDataMartService.run(command).catch(err => {
      this.logger.error(`Failed to delete legacy data mart ${dataMartId}`, err);
    });
  }
}
