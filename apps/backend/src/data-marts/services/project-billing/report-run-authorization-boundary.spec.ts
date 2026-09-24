import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT_RUN_KINDS, RunKind } from './project-billing.service';

interface ReportRunEntrypoint {
  name: string;
  file: string;
  declaration: string;
  runKinds: RunKind[];
  firstStorageBoundary: string;
}

const entrypoints: ReportRunEntrypoint[] = [
  {
    name: 'scheduled and manually triggered reports',
    file: join(__dirname, '../../use-cases/run-report.service.ts'),
    declaration: 'private async executeReportRunWithCleanup(',
    runKinds: [RunKind.SHEETS_REPORT_RUN, RunKind.EMAIL_BASED_REPORT_RUN],
    firstStorageBoundary: 'this.resolveAccessor(',
  },
  {
    // Excel reports arrive here too: the workbook pulls them over the same endpoint, so the
    // same entrypoint executes both and the same authorization has to precede both.
    name: 'HTTP Data and Excel reports',
    file: join(__dirname, '../../use-cases/stream-http-data.service.ts'),
    declaration: 'private async executeStream(',
    runKinds: [RunKind.HTTP_DATA_RUN, RunKind.EXCEL_REPORT_RUN],
    firstStorageBoundary: 'this.dataMartService.actualizeSchemaInEntityIfExpired(',
  },
  {
    name: 'MCP Query reports',
    file: join(__dirname, '../../use-cases/query-data-mart.service.ts'),
    declaration: 'async run(',
    runKinds: [RunKind.MCP_QUERY_RUN],
    firstStorageBoundary: 'this.readerResolver.resolve(',
  },
  {
    name: 'Looker Studio reports (streaming)',
    file: join(
      __dirname,
      '../../data-destination-types/looker-studio-connector/services/looker-studio-connector-api.service.ts'
    ),
    declaration: 'private async getFullDataExtractionStreaming(',
    runKinds: [RunKind.LOOKER_REPORT_RUN],
    firstStorageBoundary: 'this.getCachedReader(',
  },
  {
    name: 'Looker Studio reports (non-streaming)',
    file: join(
      __dirname,
      '../../data-destination-types/looker-studio-connector/services/looker-studio-connector-api.service.ts'
    ),
    declaration: 'private async getFullDataExtraction(',
    runKinds: [RunKind.LOOKER_REPORT_RUN],
    firstStorageBoundary: 'this.getCachedReader(',
  },
];

describe('Report Run authorization boundary', () => {
  it('maps every report run kind to an execution entrypoint', () => {
    const mappedKinds = [...new Set(entrypoints.flatMap(entrypoint => entrypoint.runKinds))].sort();

    expect(mappedKinds).toEqual([...REPORT_RUN_KINDS].sort());
  });

  it.each(entrypoints)('authorizes $name before its first storage boundary', entrypoint => {
    const method = extractMethod(readFileSync(entrypoint.file, 'utf8'), entrypoint.declaration);
    const authorization = method.indexOf('this.projectBillingService.verifyCanPerformOperations(');
    const storageBoundary = method.indexOf(entrypoint.firstStorageBoundary);

    expect(authorization).toBeGreaterThan(-1);
    expect(storageBoundary).toBeGreaterThan(authorization);
  });
});

function extractMethod(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Could not find method declaration: ${declaration}`);

  const openingParenthesis = source.indexOf('(', start);
  let parenthesisDepth = 0;
  let closingParenthesis = -1;
  for (let index = openingParenthesis; index < source.length; index += 1) {
    if (source[index] === '(') parenthesisDepth += 1;
    if (source[index] === ')' && --parenthesisDepth === 0) {
      closingParenthesis = index;
      break;
    }
  }

  const openingBrace = source.indexOf('{', closingParenthesis);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not find method end: ${declaration}`);
}
