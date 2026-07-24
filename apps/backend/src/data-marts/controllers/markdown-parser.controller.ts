import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarkdownParser } from '../../common/markdown/markdown-parser.service';
import { Auth, Role, Strategy } from '../../idp';
import { MarkdownParseRequestApiDto } from '../dto/presentation/markdown-parse-request-api.dto';
import { ParseMarkdownToHtmlSpec } from './spec/markdown-parser.api';

@Controller('/markdown')
@ApiTags('Utils')
export class MarkdownParserController {
  constructor(private readonly markdownParser: MarkdownParser) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('/parse-to-html')
  @ParseMarkdownToHtmlSpec()
  async parseToHtml(@Body() request: MarkdownParseRequestApiDto): Promise<string> {
    return await this.markdownParser.parseToHtml(request.markdown);
  }
}
