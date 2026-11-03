import { ApiProperty } from '@nestjs/swagger';

export class ConnectorPickerTokenResponseApiDto {
  @ApiProperty({
    description:
      "A fresh Google access token for Google Picker, made from the Credential's sign-in",
  })
  accessToken: string;
}
