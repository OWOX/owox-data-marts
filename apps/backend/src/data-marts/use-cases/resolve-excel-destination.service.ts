import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { ResolveExcelDestinationCommand } from '../dto/domain/resolve-excel-destination.command';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataDestinationService } from '../services/data-destination.service';
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
 *
 * Convergent, not exclusive, and that is the intended shape. Nothing serializes the
 * find-then-create — a plain SELECT takes no lock against another transaction's insert — so two
 * members opening the add-in for the first time at the same moment each end up with one of
 * their own. A destination per user is a perfectly good outcome here; from the second call
 * onwards everyone converges on the oldest row they can use anyway.
 *
 * Do not reach for a unique index over (projectId, type) to make it exclusive. Destinations are
 * soft-deleted, so a deleted row would keep the slot and dead-end every later resolve — and a
 * second Excel destination is meant to become legal once one can point at a particular OneDrive
 * account.
 */
@Injectable()
export class ResolveExcelDestinationService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly createService: CreateDataDestinationService,
    private readonly getService: GetDataDestinationService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: ResolveExcelDestinationCommand): Promise<DataDestinationDto> {
    // Oldest first, so repeated calls keep returning the same destination once one exists.
    const candidates = await this.dataDestinationService.listByProjectIdAndType(
      command.projectId,
      DataDestinationType.EXCEL
    );

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
