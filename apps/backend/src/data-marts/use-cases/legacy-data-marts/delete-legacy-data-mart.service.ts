import { Injectable, Logger } from '@nestjs/common';
import { DeleteDataMartCommand } from '../../dto/domain/delete-data-mart.command';
import { DeleteLegacyDataMartCommand } from '../../dto/domain/legacy-data-marts/delete-legacy-data-mart.command';
import { DataMartService } from '../../services/data-mart.service';
import { DeleteDataMartService } from '../delete-data-mart.service';

@Injectable()
export class DeleteLegacyDataMartService {
  private readonly logger = new Logger(DeleteLegacyDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly deleteDataMartService: DeleteDataMartService
  ) {}

  async run(command: DeleteLegacyDataMartCommand): Promise<void> {
    const dataMart = await this.dataMartService.findById(command.id);
    if (dataMart) {
      await this.deleteDataMartService.run(
        new DeleteDataMartCommand(dataMart.id, dataMart.projectId, true)
      );
      this.logger.log(`Data mart ${command.id} deleted`);
    }
  }
}
