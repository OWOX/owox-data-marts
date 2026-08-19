import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportFormMode } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { GoogleSheetsReportEditSheet } from './GoogleSheetsReportEditSheet';

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

vi.mock('../GoogleSheetsReportEditForm', () => ({
  GoogleSheetsReportEditForm: () => null,
}));

vi.mock('../../../../../data-destination', () => ({
  DataDestinationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  dataMart: { id: 'mart-1', title: 'Mart' },
} as unknown as DataMartReport;

function renderSheet(mode: ReportFormMode = ReportFormMode.EDIT) {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-marts/mart-1/reports']}>
      <GoogleSheetsReportEditSheet
        isOpen
        onClose={vi.fn()}
        mode={mode}
        initialReport={mode === ReportFormMode.EDIT ? initialReport : undefined}
      />
    </MemoryRouter>
  );
}

describe('GoogleSheetsReportEditSheet', () => {
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
});
