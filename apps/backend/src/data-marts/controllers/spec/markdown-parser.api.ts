import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import { MarkdownParseRequestApiDto } from '../../dto/presentation/markdown-parse-request-api.dto';

export function ParseMarkdownToHtmlSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Convert Markdown to application-rendered HTML' }),
    ApiBody({ type: MarkdownParseRequestApiDto }),
    ApiCreatedResponse({
      description: 'Rendered HTML using the same Markdown pipeline as the OWOX Data Marts UI',
      content: {
        'text/html': {
          schema: {
            type: 'string',
            example: '<div class="markdown-body"><h1>Revenue</h1></div>',
          },
        },
      },
    })
  );
}
