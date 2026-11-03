import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConnectorTargetConflictQueryApiDto {
  @ApiProperty({ description: 'Fully qualified name of the connector target table' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  fullyQualifiedName: string;
}

export class ConnectorTargetConflictDataMartApiDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;
}

export class ConnectorTargetConflictResponseApiDto {
  @ApiProperty()
  conflict: boolean;

  @ApiProperty({
    type: ConnectorTargetConflictDataMartApiDto,
    nullable: true,
    description: 'The other Data Mart, or null when none exists or the caller cannot see it',
  })
  dataMart: ConnectorTargetConflictDataMartApiDto | null;
}
