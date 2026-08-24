import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { ResolveExcelDestinationCommand } from '../dto/domain/resolve-excel-destination.command';
import { DataDestination } from '../entities/data-destination.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { CreateDataDestinationService } from './create-data-destination.service';
import { GetDataDestinationService } from './get-data-destination.service';

const EXCEL_DESTINATION_TITLE = 'Microsoft Excel';

/**
 * Returns an Excel destination the caller can use, creating one if they have none.
 *
 * Every other destination type is set up deliberately, because setting one up means handing
 * over a credential — a service account, a webhook, an OAuth grant. An Excel destination holds
 * nothing, so requiring a user to create one before their first report would be requiring them
 * to fill in a form with no fields. Creating one by hand is still allowed, and will matter once
 * a destination points at a particular OneDrive account and a project needs more than one.
 *
 * The choice is made on access, not on ownership. A destination shared for use gives every
 * project member SEE and USE, so one row usually serves everyone; but a row that exists and is
 * *not* reachable by this caller must not be handed back, or they would get a 403 with no way
 * out — the destination they cannot use would keep blocking the creation of one they can.
 */
@Injectable()
export class ResolveExcelDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly createService: CreateDataDestinationService,
    private readonly getService: GetDataDestinationService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: ResolveExcelDestinationCommand): Promise<DataDestinationDto> {
    // Oldest first, so repeated calls keep returning the same destination once one exists.
    const candidates = await this.repository.find({
      where: { projectId: command.projectId, type: DataDestinationType.EXCEL },
      order: { createdAt: 'ASC' },
    });

    for (const candidate of candidates) {
      const canUse = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DESTINATION,
        candidate.id,
        Action.USE,
        command.projectId
      );
      if (canUse) {
        return this.getService.run(
          new GetDataDestinationCommand(
            candidate.id,
            command.projectId,
            command.userId,
            command.roles
          )
        );
      }
    }

    return this.createService.run(
      new CreateDataDestinationCommand({
        projectId: command.projectId,
        title: EXCEL_DESTINATION_TITLE,
        type: DataDestinationType.EXCEL,
        userId: command.userId,
        roles: command.roles,
        // Explicit rather than relying on the default: this is the flag that makes the
        // destination reachable by the rest of the project rather than only its creator.
        availableForUse: true,
      })
    );
  }
}
