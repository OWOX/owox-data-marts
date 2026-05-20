import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GeneratedSqlViewer } from '../GeneratedSqlViewer';
import { showApiErrorToast } from '../../../../../../shared/utils';
import { reportService } from '../../../../reports/shared/services/report.service';

vi.mock('../../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/p/proj${path}` }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('../../../../reports/shared/services/report.service', () => ({
  reportService: {
    getGeneratedSql: vi.fn(),
    copyAsDataMart: vi.fn(),
  },
}));

vi.mock('../SqlValidator/SqlValidator', () => ({
  default: () => <div data-testid='sql-validator' />,
}));

vi.mock('@monaco-editor/react', () => ({
  Editor: () => <div data-testid='monaco-editor' />,
}));

vi.mock('../../../../../../shared/utils', () => ({
  showApiErrorToast: vi.fn(),
}));

describe('GeneratedSqlViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when canViewSql is false', () => {
    const { container } = render(
      <GeneratedSqlViewer
        reportId='r-1'
        dataMartId='dm-1'
        canViewSql={false}
        canCopyAsDataMart={true}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders trigger button when canViewSql is true', () => {
    render(
      <GeneratedSqlViewer
        reportId='r-1'
        dataMartId='dm-1'
        canViewSql={true}
        canCopyAsDataMart={false}
      />
    );
    expect(screen.getByLabelText('View joined Data Marts SQL')).toBeInTheDocument();
  });

  it('calls showApiErrorToast once with backend error when getGeneratedSql rejects', async () => {
    const apiError = {
      response: {
        data: {
          message: 'Forbidden',
          statusCode: 403,
          path: '/api/reports/r-1/generated-sql',
          timestamp: '',
        },
      },
    };
    vi.mocked(reportService.getGeneratedSql).mockRejectedValueOnce(apiError);

    render(
      <GeneratedSqlViewer
        reportId='r-1'
        dataMartId='dm-1'
        canViewSql={true}
        canCopyAsDataMart={false}
      />
    );

    fireEvent.click(screen.getByLabelText('View joined Data Marts SQL'));

    await waitFor(() => {
      expect(showApiErrorToast).toHaveBeenCalledTimes(1);
      expect(showApiErrorToast).toHaveBeenCalledWith(apiError, 'Failed to load generated SQL');
    });
  });
});
