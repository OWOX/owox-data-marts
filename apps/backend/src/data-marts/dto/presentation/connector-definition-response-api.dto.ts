import { ApiProperty } from '@nestjs/swagger';

export class ConnectorDefinitionResponseApiDto {
  @ApiProperty({ example: 'FacebookMarketing' })
  name: string;

  @ApiProperty({ example: 'Facebook Marketing' })
  title: string;

  @ApiProperty({ example: 'Connect to Facebook Marketing API', nullable: true })
  description: string | null;

  @ApiProperty({ example: 'facebook-icon.svg', nullable: true })
  icon: string | null;
}
