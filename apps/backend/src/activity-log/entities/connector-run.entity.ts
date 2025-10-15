import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { DataMart } from 'src/data-marts/entities/data-mart.entity';
import { EntityType } from 'src/activity-log/enums/entity-type.enum';
import { EventType } from 'src/activity-log/enums/event-type.enum';
import { ConnectorRunStatus } from 'src/activity-log/enums/connector-run-status.enum';
import { ConnectorRunUiDetails } from 'src/activity-log/types/connector-run-ui-details.type';
import { ConnectorRunDetails } from 'src/activity-log/types/connector-run-details.type';

@Entity()
export class ConnectorRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  occuredAt: string;

  @Column({ type: 'enum', enum: EventType })
  eventType: EventType;

  @Column({ type: 'enum', enum: EntityType })
  entityType: EntityType;

  @Column()
  entityId: string;

  @Column()
  projectId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ConnectorRunStatus })
  status: ConnectorRunStatus;

  @Column({ type: 'json', nullable: true })
  uiDetails: ConnectorRunUiDetails;

  @Column({ type: 'json', nullable: true })
  details: ConnectorRunDetails;

  dataMart: DataMart;
}
