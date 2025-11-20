import { Column, Entity } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { InsightRunResponseApiDto } from '../dto/presentation/insight-run-response-api.dto';

@Entity('insight_run_triggers')
export class InsightRunTrigger extends UiTrigger<InsightRunResponseApiDto> {
  @Column()
  dataMartId: string;

  @Column()
  projectId: string;

  @Column()
  insightId: string;
}
