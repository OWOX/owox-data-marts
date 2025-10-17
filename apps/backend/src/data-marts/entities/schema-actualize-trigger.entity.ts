import { Entity, Column } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { SchemaActualizeResponseApiDto } from '../dto/presentation/schema-actualize-response-api.dto';

@Entity('schema_actualize_triggers')
export class SchemaActualizeTrigger extends UiTrigger<SchemaActualizeResponseApiDto> {
  @Column()
  dataMartId: string;

  @Column()
  projectId: string;
}
