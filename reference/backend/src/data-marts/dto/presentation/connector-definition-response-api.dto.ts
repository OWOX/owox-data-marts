import { ApiProperty } from '@nestjs/swagger';

export class ConnectorDefinitionResponseApiDto {
  @ApiProperty({ example: 'FacebookMarketing' })
  name: string;

  @ApiProperty({ example: 'Facebook Marketing' })
  title: string;

  @ApiProperty({ example: 'Connect to Facebook Marketing API', nullable: true })
  description: string | null;

  @ApiProperty({ example: 'base64-encoded-logo', nullable: true })
  logo: string | null;

  @ApiProperty({
    example: 'https://docs.owox.com/packages/connectors/src/sources/tik-tok-ads/readme/',
    nullable: true,
  })
  docUrl: string | null;
}
