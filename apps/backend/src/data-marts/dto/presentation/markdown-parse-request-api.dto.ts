import { ApiProperty } from '@nestjs/swagger';

export class MarkdownParseRequestApiDto {
  @ApiProperty({
    description: 'Markdown source to render with the OWOX Data Marts Markdown pipeline',
    example: '# Revenue\n\n**Net revenue** after refunds.',
  })
  markdown!: string;
}
