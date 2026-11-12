import { ApiProperty } from '@nestjs/swagger';

export class OwoxAiStatusApiDto {
  @ApiProperty({
    enum: ['fast', 'reasoning', 'embedding'],
    isArray: true,
    description: 'The models that OWOX AI offers in this deployment. Empty when OWOX AI is off.',
  })
  models: ('fast' | 'reasoning' | 'embedding')[];

  @ApiProperty({ description: 'Whether OWOX AI calls count toward project billing.' })
  billed: boolean;
}
