import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarkdownParser } from '../../common/markdown/markdown-parser.service';
import { Auth, Role, Strategy } from '../../idp';

@Controller('/markdown')
@ApiTags('Utils')
export class MarkdownParserController {
  constructor(private readonly markdownParser: MarkdownParser) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('/parse-to-html')
  async parseToHtml(@Body('markdown') markdown: string): Promise<string> {
    return await this.markdownParser.parseToHtml(markdown);
  }
}
