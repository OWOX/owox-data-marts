import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConfigurationView } from '../ConfigurationView';

const definitionRun = { sqlQuery: 'SELECT * FROM `t`' } as never;

const reportDefinition = {
  title: 'R',
  destination: { id: 'd', title: 'D', type: 'GOOGLE_SHEETS' },
  destinationConfig: { type: 'google-sheets-config' },
  outputConfig: {
    filterConfig: [{ column: 'report_date', operator: 'gte', value: '2026-01-01' }],
  },
  executionSqlQuery: "SELECT * FROM (SELECT * FROM `t`) WHERE report_date >= DATE '2026-01-01'",
} as never;

describe('ConfigurationView', () => {
  it('renders executionSqlQuery in a dedicated Executed SQL block, not inside Configuration', () => {
    const { container } = render(
      <ConfigurationView
        definitionRun={definitionRun}
        reportDefinition={reportDefinition}
        insightDefinition={null}
        insightTemplateDefinition={null}
        additionalParams={null}
      />
    );

    const headings = Array.from(container.querySelectorAll('h4')).map(h => h.textContent);
    const pres = Array.from(container.querySelectorAll('pre'));

    // Dedicated, plain-text Executed SQL block (real newlines, not JSON-escaped).
    expect(headings).toContain('Executed SQL:');
    const execPre = pres.find(p =>
      p.textContent.includes("WHERE report_date >= DATE '2026-01-01'")
    );
    expect(execPre).toBeDefined();

    // Configuration block keeps the raw sqlQuery and does NOT carry executionSqlQuery.
    const configPre = pres.find(p => p.textContent.includes('"sqlQuery"'));
    expect(configPre).toBeDefined();
    expect(configPre?.textContent).not.toContain('executionSqlQuery');

    // Report definition block must not contain it either.
    const reportDefPre = pres.find(p => p.textContent.includes('"title": "R"'));
    expect(reportDefPre?.textContent).not.toContain('executionSqlQuery');
  });

  it('omits the Executed SQL block when executionSqlQuery is absent', () => {
    const { container } = render(
      <ConfigurationView
        definitionRun={definitionRun}
        reportDefinition={
          { ...(reportDefinition as object), executionSqlQuery: undefined } as never
        }
        insightDefinition={null}
        insightTemplateDefinition={null}
        additionalParams={null}
      />
    );

    const headings = Array.from(container.querySelectorAll('h4')).map(h => h.textContent);
    expect(headings).not.toContain('Executed SQL:');

    const configPre = container.querySelector('pre');
    expect(configPre?.textContent).toContain('"sqlQuery"');
    expect(configPre?.textContent).not.toContain('executionSqlQuery');
  });
});
