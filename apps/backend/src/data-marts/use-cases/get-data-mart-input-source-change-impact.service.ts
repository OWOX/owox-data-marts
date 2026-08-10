import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataMartInputSourceChangeImpactDto } from '../dto/domain/data-mart-input-source-change-impact.dto';
import { GetDataMartInputSourceChangeImpactCommand } from '../dto/domain/get-data-mart-input-source-change-impact.command';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { ReportService } from '../services/report.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

/**
 * Counts what depends on a data mart, so the user can judge the blast radius before repointing it
 * at another input source. Gated on EDIT because that is the action the answer feeds into.
 */
@Injectable()
export class GetDataMartInputSourceChangeImpactService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly reportService: ReportService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(
    command: GetDataMartInputSourceChangeImpactCommand
  ): Promise<DataMartInputSourceChangeImpactDto> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    // Inbound is a row count, not distinct sources: one source may join this data mart under
    // several aliases, and every one of those joins depends on this data mart's fields.
    const [outbound, inboundCount, reportsCount] = await Promise.all([
      this.relationshipService.findBySourceDataMartId(command.id),
      this.relationshipService.countByTargetDataMartId(command.id, command.projectId),
      this.reportService.countByDataMartIdAndProjectId(command.id, command.projectId),
    ]);

    return new DataMartInputSourceChangeImpactDto(outbound.length, inboundCount, reportsCount);
  }
}
