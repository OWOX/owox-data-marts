// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DataQualityCompactStatusLink } from './DataQualityCompactStatusLink';

describe('DataQualityCompactStatusLink', () => {
  it('links Output Schema to Quality without rendering controls', () => {
    render(
      <MemoryRouter>
        <DataQualityCompactStatusLink
          projectId='project-1'
          dataMartId='mart-1'
          summary={{
            dataMartRunId: 'run-1',
            lastRunAt: '2026-07-15T12:00:01.000Z',
            state: 'ISSUES',
            enabledChecks: 2,
            totalChecks: 2,
            passedChecks: 1,
            failedChecks: 1,
            notApplicableChecks: 0,
            errorChecks: 0,
            noticeFindings: 0,
            warningFindings: 1,
            errorFindings: 0,
            violationCount: 2,
            highestSeverity: 'warning',
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Quality issues found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Quality/ })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/mart-1/quality'
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
