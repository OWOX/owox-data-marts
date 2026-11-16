import { ApiProperty } from '@nestjs/swagger';

export class OwoxAiStatusApiDto {
  @ApiProperty({
    enum: ['fast', 'reasoning', 'embedding', 'decision'],
    isArray: true,
    description: 'The models that OWOX AI offers in this deployment. Empty when OWOX AI is off.',
  })
  models: ('fast' | 'reasoning' | 'embedding' | 'decision')[];

  @ApiProperty({ description: 'Whether OWOX AI calls count toward project billing.' })
  billed: boolean;
}
