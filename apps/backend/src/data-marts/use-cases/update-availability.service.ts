import { Injectable, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class UpdateAvailabilityService {
  private readonly logger = new Logger(UpdateAvailabilityService.name);

  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async updateDataMartSharing(
    dataMartId: string,
    projectId: string,
    userId: string,
    roles: string[],
    availableForReporting: boolean,
    availableForMaintenance: boolean
  ): Promise<void> {
    const dm = await this.dataMartRepository.findOne({
      where: { id: dataMartId, projectId },
    });
    if (!dm) throw new NotFoundException('DataMart not found');

    const canConfigure = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.CONFIGURE_SHARING,
      projectId
    );
    if (!canConfigure)
      throw new ForbiddenException('You cannot configure sharing for this DataMart');

    dm.availableForReporting = availableForReporting;
    dm.availableForMaintenance = availableForMaintenance;
    await this.dataMartRepository.save(dm);
  }

  async updateStorageSharing(
    storageId: string,
    projectId: string,
    userId: string,
    roles: string[],
    availableForUse: boolean,
    availableForMaintenance: boolean
  ): Promise<void> {
    const storage = await this.dataStorageRepository.findOne({
      where: { id: storageId, projectId },
    });
    if (!storage) throw new NotFoundException('Storage not found');

    const canConfigure = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.STORAGE,
      storageId,
      Action.CONFIGURE_SHARING,
      projectId
    );
    if (!canConfigure)
      throw new ForbiddenException('You cannot configure sharing for this Storage');

    storage.availableForUse = availableForUse;
    storage.availableForMaintenance = availableForMaintenance;
    await this.dataStorageRepository.save(storage);
  }

  async updateDestinationSharing(
    destinationId: string,
    projectId: string,
    userId: string,
    roles: string[],
    availableForUse: boolean,
    availableForMaintenance: boolean
  ): Promise<void> {
    const dest = await this.dataDestinationRepository.findOne({
      where: { id: destinationId, projectId },
    });
    if (!dest) throw new NotFoundException('Destination not found');

    const canConfigure = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DESTINATION,
      destinationId,
      Action.CONFIGURE_SHARING,
      projectId
    );
    if (!canConfigure)
      throw new ForbiddenException('You cannot configure sharing for this Destination');

    dest.availableForUse = availableForUse;
    dest.availableForMaintenance = availableForMaintenance;
    await this.dataDestinationRepository.save(dest);
  }
}
