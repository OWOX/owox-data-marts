import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import { DataMartContext } from '../../../../edit/model';
import type { DataMartContextType } from '../../../../edit/model/context/types';
import { DataMartDefinitionType } from '../../../../shared';
import { DataStorageType } from '../../../../../data-storage/shared/model/types/data-storage-type.enum';
import { EmailReportEditSheet } from '../../../edit/components/EmailReportEditSheet';
import { ReportFormMode } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportEditSheetRenderer } from './ReportEditSheetRenderer';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../../utils/data-layer', () => ({ trackEvent }));

const authMock = vi.hoisted(() => ({
  value: {
    status: 'authenticated',
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['admin'] as string[],
      mcpServerUrl: 'https://mcp.example.com' as string | undefined,
    },
  },
}));
vi.mock('../../../../../idp', () => ({
  useAuth: () => authMock.value,
  useRole: () => ({
    canEdit: ['admin', 'editor'].some(role => authMock.value.user.roles.includes(role)),
  }),
}));

const form = vi.hoisted(() => ({ promo }: { promo?: ReactNode }) => (
  <form data-testid='report-form'>
    <input aria-label='First field' />
    <button type='submit'>Save</button>
    {promo}
  </form>
));
vi.mock('../../../edit/components/ReportEditForm', () => ({ ReportEditForm: form }));
vi.mock('../../../edit/components/LookerStudioReportEditForm', () => ({
  LookerStudioReportEditForm: form,
}));
vi.mock('../../../edit/components/EmailReportEditForm', () => ({ EmailReportEditForm: form }));

vi.mock('../../../../edit/components/ReportColumnPicker/GeneratedSqlViewer', () => ({
  GeneratedSqlViewer: () => null,
}));

vi.mock('../../../../../../shared/hooks/useIntercomLauncher', () => ({
  useIntercomLauncher: () => undefined,
}));

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({
    children,
    onOpenAutoFocus,
  }: {
    children: ReactNode;
    onOpenAutoFocus?: (event: unknown) => void;
  }) => (
    <aside
      role='dialog'
      tabIndex={-1}
      ref={el => {
        if (el) onOpenAutoFocus?.({ preventDefault: vi.fn(), currentTarget: el });
      }}
    >
      {children}
    </aside>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const dataMartContext = { dataMart: { id: 'mart-1' } } as unknown as DataMartContextType;

const destination = (type: DataDestinationType) =>
  ({ id: 'dest-1', title: 'Destination', type }) as unknown as DataDestination;

const report = {
  id: 'report-1',
  title: 'Weekly report',
  dataMart: {
    id: 'mart-1',
    title: 'Mart',
    definitionType: DataMartDefinitionType.SQL,
    storage: { type: DataStorageType.GOOGLE_BIGQUERY },
  },
  dataDestination: { id: 'dest-1' },
} as unknown as DataMartReport;

function renderSheet(node: ReactNode) {
  return render(
    <MemoryRouter>
      <DataMartContext.Provider value={dataMartContext}>{node}</DataMartContext.Provider>
    </MemoryRouter>
  );
}

function renderRenderer(type: DataDestinationType, mode: ReportFormMode) {
  return renderSheet(
    <ReportEditSheetRenderer
      destination={destination(type)}
      isOpen
      onClose={vi.fn()}
      mode={mode}
      initialReport={mode === ReportFormMode.EDIT ? report : null}
    />
  );
}

/** The renderer passes the line to the form (the stub renders it last); its links carry the prompt. */
function promoLine(wording: string) {
  const line = screen.getByTestId('report-form').lastElementChild as HTMLElement;
  expect(line).toHaveTextContent(wording);
  return decodeURIComponent(
    within(line)
      .getByRole('link', { name: /^Claude/ })
      .getAttribute('href') ?? ''
  );
}

/** The renderer passed no line: nothing follows the stub's Save button. */
const formHasNoLine = () => {
  expect(screen.getByTestId('report-form').lastElementChild).toBe(
    screen.getByRole('button', { name: 'Save' })
  );
};

describe.each([
  ['Google Sheets', DataDestinationType.GOOGLE_SHEETS],
  ['Looker Studio', DataDestinationType.LOOKER_STUDIO],
  ['Email', DataDestinationType.EMAIL],
])('%s report sheet AI assistant block', (_name, type) => {
  beforeEach(() => {
    trackEvent.mockClear();
    localStorage.clear();
    authMock.value.user.mcpServerUrl = 'https://mcp.example.com';
    authMock.value.user.roles = ['admin'];
  });

  it('passes the setup line to the form and keeps focus on the first field', () => {
    renderRenderer(type, ReportFormMode.CREATE);

    expect(document.activeElement).toBe(screen.getByLabelText('First field'));
    expect(promoLine('Or finish this in')).toContain(
      'help me create a report for Data Mart mart-1 in Destination dest-1 in project project-1.'
    );
  });

  it('passes the maintain line when it edits a report', () => {
    renderRenderer(type, ReportFormMode.EDIT);

    expect(promoLine('Or change this in')).toContain(
      'help me maintain report report-1 of Data Mart mart-1 in project project-1. Do not create another report.'
    );
  });

  it('shows nothing, sends no event and keeps the default focus without MCP', () => {
    authMock.value.user.mcpServerUrl = undefined;
    renderRenderer(type, ReportFormMode.CREATE);

    formHasNoLine();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(screen.getByLabelText('First field'));
  });

  it('gives a viewer no block and no event', () => {
    authMock.value.user.roles = ['viewer'];
    renderRenderer(type, ReportFormMode.EDIT);

    formHasNoLine();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe('EmailReportEditSheet in an Insight', () => {
  it('shows no AI assistant block', () => {
    authMock.value.user.mcpServerUrl = 'https://mcp.example.com';
    renderSheet(
      <EmailReportEditSheet
        isOpen
        onClose={vi.fn()}
        mode={ReportFormMode.EDIT}
        initialReport={report}
        preSelectedDestination={null}
        isInsightContext
      />
    );

    formHasNoLine();
  });
});
