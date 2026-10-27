import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { ListDataDestinationsByTypeCommand } from '../dto/domain/list-data-destinations-by-type.command';
import { ListDataDestinationsByTypeItemDto } from '../dto/domain/list-data-destinations-by-type-item.dto';
import { DestinationCredentialBindingService } from '../data-destination-types/destination-credential-binding.service';
import type { PublicOfConsumer } from '../credentials/services/consumer-credential-binding.service';
import type { CredentialIdentity } from '../entities/credential-identity.type';

@Injectable()
export class ListDataDestinationsByTypeService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepo: Repository<DataDestination>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly destinationCredentials: DestinationCredentialBindingService
  ) {}

  async run(
    command: ListDataDestinationsByTypeCommand
  ): Promise<ListDataDestinationsByTypeItemDto[]> {
    const { projectId } = command;

    const candidates = await this.dataDestinationRepo.find({
      where: { projectId, type: command.type },
    });
    const bound = await this.destinationCredentials.findBoundDestinationIds(
      projectId,
      candidates.map(d => d.id)
    );
    const destinations = candidates.filter(d => d.credentialId || bound.has(d.id));

    if (destinations.length === 0) {
      return [];
    }

    // A member sees the address to share a sheet with, as before Credentials; a plugin never gets it.
    const publicOf = command.isPluginCall
      ? new Map<string, PublicOfConsumer | null>()
      : await this.destinationCredentials.publicOfDestinations(
          projectId,
          destinations.filter(d => bound.has(d.id)).map(d => d.id)
        );

    const ids = destinations.map(d => d.id);

    const rawRows = await this.reportRepo
      .createQueryBuilder('r')
      .leftJoin('r.dataDestination', 'dd')
      .leftJoin('r.dataMart', 'dm')
      .where('dd.id IN (:...ids)', { ids })
      .andWhere('dm.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dm.deletedAt IS NULL')
      .select('dd.id', 'destinationId')
      .addSelect('MIN(dm.title)', 'dataMartName')
      .groupBy('dd.id')
      .getRawMany<{ destinationId: string; dataMartName: string | null }>();

    const nameMap = new Map<string, string | null>(
      rawRows.map(r => [r.destinationId, r.dataMartName])
    );

    return destinations.map(d => ({
      id: d.id,
      title: d.title,
      dataMartName: nameMap.get(d.id) ?? null,
      // A bound Destination never falls back to its old row, even once its Credential is deleted.
      identity: command.isPluginCall
        ? null
        : bound.has(d.id)
          ? toIdentity(publicOf.get(d.id))
          : (d.credential?.identity ?? null),
    }));
  }
}

/** A bound Credential's identity in the shape the old row carried. */
function toIdentity(bound: PublicOfConsumer | null | undefined): CredentialIdentity | null {
  const metadata = bound?.publicMetadata;
  if (!metadata) return null;
  if ('account' in metadata) return { email: metadata.account.email };
  return 'clientEmail' in metadata ? { clientEmail: metadata.clientEmail } : null;
}
