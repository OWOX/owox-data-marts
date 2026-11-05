import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { DataDestinationService } from '../services/data-destination.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { GetDataDestinationImpactCommand } from '../dto/domain/get-data-destination-impact.command';
import type { DataDestinationImpact } from '../dto/domain/data-destination-impact.dto';

@Injectable()
export class GetDataDestinationImpactService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly dataDestinationService: DataDestinationService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataDestinationImpactCommand): Promise<DataDestinationImpact> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId
    );

    const canDelete = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DESTINATION,
      command.destinationId,
      Action.DELETE,
      command.projectId
    );
    if (!canDelete) {
      throw new ForbiddenException(
        'You do not have permission to inspect deletion impact for this Destination'
      );
    }

    const rows = await this.reportRepository
      .createQueryBuilder('report')
      .innerJoin('report.dataMart', 'dataMart')
      .select('COUNT(report.id)', 'reportsCount')
      .addSelect('COUNT(DISTINCT dataMart.id)', 'dataMartCount')
      .where('report.dataDestinationId = :destinationId', { destinationId: destination.id })
      .getRawOne<{ reportsCount: string | number; dataMartCount: string | number }>();

    return {
      destinationId: destination.id,
      destinationTitle: destination.title,
      reportsCount: Number(rows?.reportsCount ?? 0),
      dataMartCount: Number(rows?.dataMartCount ?? 0),
    };
  }
}
