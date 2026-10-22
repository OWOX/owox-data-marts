import { ApiProperty } from '@nestjs/swagger';
import {
  DATA_MART_ICON_API_DESCRIPTION,
  type DataMartIconValue,
} from '../../enums/data-mart-icon.enum';

/** A context as Data Marts, Storages, Destinations and Credentials list it. */
export class ContextSummaryApiDto {
  @ApiProperty({ description: 'Context identifier' })
  id: string;

  @ApiProperty({ description: 'Context display name' })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'lucide:megaphone',
    description: `Context icon: ${DATA_MART_ICON_API_DESCRIPTION} null means the default icon.`,
  })
  icon: DataMartIconValue | null;
}
