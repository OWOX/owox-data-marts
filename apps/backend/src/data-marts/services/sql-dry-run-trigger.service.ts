import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { SqlDryRunTrigger } from '../entities/sql-dry-run-trigger.entity';
import { SqlDryRunResponseApiDto } from '../dto/presentation/sql-dry-run-response-api.dto';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';

/**
 * Service for managing SQL dry run triggers.
 * Provides methods for creating and managing SQL validation triggers.
 */
@Injectable()
export class SqlDryRunTriggerService extends UiTriggerService<SqlDryRunResponseApiDto> {
  constructor(
    @InjectRepository(SqlDryRunTrigger)
    triggerRepository: Repository<SqlDryRunTrigger>
  ) {
    super(triggerRepository);
  }

  /**
   * Create a new SQL dry run trigger
   *
   * @param userId - ID of the user creating the trigger
   * @param projectId - ID of the project
   * @param dataMartId - ID of the data mart
   * @param sql - SQL query to validate
   * @returns ID of the created trigger
   */
  async createTrigger(
    userId: string,
    projectId: string,
    dataMartId: string,
    sql: string
  ): Promise<string> {
    const trigger = new SqlDryRunTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.sql = sql;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
