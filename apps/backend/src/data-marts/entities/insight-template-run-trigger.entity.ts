import { Column, Entity } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { InsightTemplateRunResponseApiDto } from '../dto/presentation/insight-template-run-response-api.dto';

@Entity('insight_template_run_triggers')
export class InsightTemplateRunTrigger extends UiTrigger<InsightTemplateRunResponseApiDto> {
  @Column()
  dataMartId: string;

  @Column()
  projectId: string;

  @Column()
  insightTemplateId: string;
}
