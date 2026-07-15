// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataMartQualityStatusCell } from './DataMartQualityStatusCell';

vi.mock('../../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

describe('DataMartQualityStatusCell', () => {
  it('shows a compact state and links directly to the Quality tab', () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <div onClick={onClick}>
          <DataMartQualityStatusCell
            dataMartId='mart-1'
            summary={{
              state: 'ISSUES',
              enabledChecks: 3,
              totalChecks: 3,
              passedChecks: 2,
              failedChecks: 1,
              notApplicableChecks: 0,
              errorChecks: 0,
              noticeFindings: 0,
              warningFindings: 1,
              errorFindings: 0,
              violationCount: 7,
              highestSeverity: 'warning',
              dataMartRunId: 'run-1',
              lastRunAt: '2026-07-15T12:00:00.000Z',
            }}
          />
        </div>
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Open Quality: Issues' });
    expect(link).toHaveAttribute('href', '/ui/project-1/data-marts/mart-1/quality');
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the never-run state when the summary is absent', () => {
    render(
      <MemoryRouter>
        <DataMartQualityStatusCell dataMartId='mart-1' summary={null} />
      </MemoryRouter>
    );

    expect(screen.getByText('Never run')).toBeInTheDocument();
  });
});
