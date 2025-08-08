import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class RunDataMartRequestApiDto {
  /**
   * Payload for the manual run. If not provided, the data mart will be run with the default payload.
   * The payload is specific to the data mart definition type.
   * For example, for a connector data mart, the payload is the connector configuration fields with unknown structure.
   */
  @IsOptional()
  @ApiProperty({
    example: { key: 'value' },
    description: `Payload for the manual run. 
    If not provided, the data mart will be run with the default payload. 
    The payload is specific to the data mart definition type. 
    For example, for a connector data mart, the payload is the connector configuration fields with unknown structure.`,
  })
  payload?: Record<string, unknown> | undefined;
}
