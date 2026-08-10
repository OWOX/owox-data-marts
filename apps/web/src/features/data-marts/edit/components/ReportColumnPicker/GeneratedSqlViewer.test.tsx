import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GeneratedSqlViewer } from './GeneratedSqlViewer';

const getGeneratedSql = vi.fn();

vi.mock('../../../reports/shared/services/report.service', () => ({
  reportService: {
    getGeneratedSql: (...args: unknown[]) => getGeneratedSql(...args) as unknown,
  },
}));

// Monaco pulls in web workers that happy-dom cannot run — render the SQL as a
// plain textarea so assertions can still see it.
vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}));

// The dry-run validator is the thing we assert is absent for read-only viewers;
// give it a stable test id instead of reaching into its internals.
vi.mock('../SqlValidator/SqlValidator', () => ({
  default: () => <div data-testid='sql-validator' />,
}));

vi.mock('../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => path }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

async function openDialog() {
  render(<GeneratedSqlViewer reportId='report-1' dataMartId='dm-1' variant='outline-button' />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview SQL' }));
  await waitFor(() => {
    expect(screen.getByDisplayValue('SELECT 1')).toBeInTheDocument();
  });
}

describe('GeneratedSqlViewer — read-only viewers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the SQL and Copy to Clipboard, but no edit-only actions, when canModifySource is false', async () => {
    getGeneratedSql.mockResolvedValue({ sql: 'SELECT 1', canModifySource: false });

    await openDialog();

    expect(screen.getByRole('button', { name: /Copy to Clipboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy as Data Mart' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sql-validator')).not.toBeInTheDocument();
  });

  it('shows the validator and Copy as Data Mart when canModifySource is true', async () => {
    getGeneratedSql.mockResolvedValue({ sql: 'SELECT 1', canModifySource: true });

    await openDialog();

    expect(screen.getByRole('button', { name: 'Copy as Data Mart' })).toBeInTheDocument();
    expect(screen.getByTestId('sql-validator')).toBeInTheDocument();
  });
});
