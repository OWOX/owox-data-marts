import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportFormMode } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportEditSheet } from './ReportEditSheet';
import { DataMartDefinitionType } from '../../../../shared';
import { DataStorageType } from '../../../../../data-storage/shared/model/types/data-storage-type.enum';

const authMock = vi.hoisted(() => ({
  value: {
    status: 'authenticated',
    user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
    signOut: vi.fn(),
  },
}));

vi.mock('../../../../../idp', () => ({
  useAuth: () => authMock.value,
}));

vi.mock('../ReportEditForm', () => ({
  ReportEditForm: () => null,
}));

vi.mock('../../../../../data-destination', () => ({
  DataDestinationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The Preview SQL dialog has its own tests; here only its presence in the header matters.
vi.mock('../../../../edit/components/ReportColumnPicker/GeneratedSqlViewer', () => ({
  GeneratedSqlViewer: ({ reportId }: { reportId: string }) => (
    <button type='button' data-report-id={reportId}>
      Preview SQL
    </button>
  ),
}));

vi.mock('../../../../../../shared/hooks/useIntercomLauncher', () => ({
  useIntercomLauncher: () => undefined,
}));

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <aside role='dialog'>{children}</aside>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const initialReport = {
  id: 'report-1',
  title: 'Weekly report',
  dataMart: {
    id: 'mart-1',
    title: 'Mart',
    definitionType: DataMartDefinitionType.SQL,
    storage: { type: DataStorageType.GOOGLE_BIGQUERY },
  },
} as unknown as DataMartReport;

function renderSheet(
  mode: ReportFormMode = ReportFormMode.EDIT,
  report: DataMartReport = initialReport
) {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-marts/mart-1/reports']}>
      <ReportEditSheet
        isOpen
        onClose={vi.fn()}
        mode={mode}
        initialReport={mode === ReportFormMode.EDIT ? report : undefined}
      />
    </MemoryRouter>
  );
}

describe('ReportEditSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
      signOut: vi.fn(),
    };
  });

  it('copies the project-scoped deep link for the report', async () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this report' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/ui/project-1/data-marts/mart-1/reports?reportId=report-1`
      );
    });
  });

  it('names no destination rather than naming the word "report" twice', () => {
    // This is the path the sheet takes with no preSelectedDestination. The name is a prefix
    // with its own trailing space, so its absence has to leave "a new report" — not "a new
    // report report", and not a double space where the name would have been.
    renderSheet(ReportFormMode.CREATE);

    expect(screen.getByText('Fill in the details to create a new report')).toBeTruthy();
  });

  it('hides the copy link button in create mode', () => {
    renderSheet(ReportFormMode.CREATE);

    expect(screen.queryByRole('button', { name: 'Copy link to this report' })).toBeNull();
  });

  it('hides the copy link button when no project id is resolvable', () => {
    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: '', roles: ['admin'] },
      signOut: vi.fn(),
    };

    renderSheet();

    expect(screen.queryByRole('button', { name: 'Copy link to this report' })).toBeNull();
  });

  it('shows Preview SQL for the edited report next to Copy link', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'Preview SQL' }).dataset.reportId).toBe('report-1');
  });

  it('hides Preview SQL in create mode', () => {
    renderSheet(ReportFormMode.CREATE);

    expect(screen.queryByRole('button', { name: 'Preview SQL' })).toBeNull();
  });

  it('hides Preview SQL when the storage cannot generate SQL for the definition', () => {
    renderSheet(ReportFormMode.EDIT, {
      ...initialReport,
      dataMart: {
        ...initialReport.dataMart,
        definitionType: DataMartDefinitionType.TABLE_PATTERN,
        storage: { type: DataStorageType.AWS_ATHENA },
      },
    } as unknown as DataMartReport);

    expect(screen.queryByRole('button', { name: 'Preview SQL' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link to this report' })).toBeTruthy();
  });
});
