import { describe, it, expect, vi } from 'vitest';
import { createContext, useContext, useReducer, useState, type ReactNode } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ParametersEditor } from './ParametersEditor';
import { BuilderContext } from '../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../shared/model/context/reducer';
import type { BuilderState } from '../../shared/model/context/types';
import { createEmptyManifest, type ManifestParameter } from '../../shared/model/manifest.types';
import { addParameter } from '../parameters-test-helpers';

// Radix's DropdownMenu never opens under this environment's pointer-events, so the row
// kebab is replaced by a shim with the same open/close contract. ParameterRowActions is
// the ONLY component in this tree that uses the menu, so nothing else is affected.
const DropdownOpenCtx = createContext(false);

vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
      <DropdownOpenCtx.Provider value={open}>
        {/* Any click inside toggles, which is also what happens for real: choosing an
            item both fires its handler and dismisses the menu. */}
        <div
          onClick={() => {
            setOpen(o => !o);
          }}
        >
          {children}
        </div>
      </DropdownOpenCtx.Provider>
    );
  },
  DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => {
    const open = useContext(DropdownOpenCtx);
    return open ? <div>{children}</div> : null;
  },
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <div role='menuitem' onClick={onClick}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

// Snapshot of the (fake) store's state as of the most recent render, so tests can assert
// on what actually landed in `manifest.parameters` — not only on what's shown in the DOM.
// Held in an object so the Harness component below mutates a property rather than
// reassigning an outer binding, which the react-hooks lint rules forbid.
const latest: { state?: BuilderState } = {};

/** Minimal stand-in for `BuilderProvider` that lets a test seed `manifest.parameters` up
 * front — `BuilderProvider` itself always starts from `createEmptyManifest()`, with no way
 * to inject existing parameters before the first render. */
function Harness({ parameters }: { parameters: Record<string, ManifestParameter> }) {
  const [state, dispatch] = useReducer(builderReducer, {
    ...initialBuilderState,
    manifest: { ...createEmptyManifest(), parameters },
  });
  latest.state = state;
  return (
    <BuilderContext.Provider value={{ state, dispatch }}>
      <ParametersEditor />
    </BuilderContext.Provider>
  );
}

function renderWithParameters(parameters: Record<string, ManifestParameter> = {}) {
  latest.state = undefined;
  return render(<Harness parameters={parameters} />);
}

// The engine auto-injects these two into every manifest at parse time (see
// AdvancedParametersEditor.tsx's own doc comment); the Advanced Parameters card is their
// sole editor, so representative values are enough — the exact shape isn't under test here.
const REIMPORT_PARAM: ManifestParameter = {
  requiredType: 'number',
  isRequired: true,
  default: 2,
  label: 'Reimport Lookback Window',
  attributes: ['ADVANCED'],
};
const CREATE_EMPTY_PARAM: ManifestParameter = {
  requiredType: 'boolean',
  isRequired: false,
  default: true,
  label: 'Create Empty Tables',
  attributes: ['ADVANCED'],
};

describe('ParametersEditor — engine-managed advanced params stay out of the generic table', () => {
  it('does not render ReimportLookbackWindow/CreateEmptyTables as rows, but still renders a normal custom param', () => {
    renderWithParameters({
      ReimportLookbackWindow: REIMPORT_PARAM,
      CreateEmptyTables: CREATE_EMPTY_PARAM,
      VsCurrency: { requiredType: 'string', isRequired: false, default: 'usd' },
    });

    const editor = screen.getByTestId('parameters-editor');
    expect(within(editor).queryByTestId('param-ReimportLookbackWindow')).toBeNull();
    expect(within(editor).queryByTestId('param-CreateEmptyTables')).toBeNull();
    expect(within(editor).getByTestId('param-VsCurrency')).toBeInTheDocument();
  });

  it('shows the empty-table state when the two managed params are the only entries in manifest.parameters', () => {
    renderWithParameters({
      ReimportLookbackWindow: REIMPORT_PARAM,
      CreateEmptyTables: CREATE_EMPTY_PARAM,
    });
    expect(screen.getByText('No parameters yet — add one above.')).toBeInTheDocument();
  });

  it('keeps both params out of the table after they are written via the Advanced Parameters card', () => {
    renderWithParameters({});
    // The Advanced Parameters card writes parameters.ReimportLookbackWindow /
    // .CreateEmptyTables directly on edit (see AdvancedParametersEditor.tsx) — this must
    // not surface them as rows in the generic table above.
    fireEvent.change(screen.getByLabelText('Reimport Lookback Window'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create Empty Tables' }));

    expect(latest.state?.manifest.parameters.ReimportLookbackWindow.default).toBe(5);
    expect(latest.state?.manifest.parameters.CreateEmptyTables.default).toBe(false);

    const editor = screen.getByTestId('parameters-editor');
    expect(within(editor).queryByTestId('param-ReimportLookbackWindow')).toBeNull();
    expect(within(editor).queryByTestId('param-CreateEmptyTables')).toBeNull();
  });

  it('editing an unrelated custom param does not drop the two managed params from manifest.parameters', () => {
    // Regression guard: the generic table's commit() rebuilds the whole `parameters`
    // record from its own rows, which by design never include the two managed keys — so
    // it must carry their current values forward rather than silently wiping them out.
    renderWithParameters({
      ReimportLookbackWindow: REIMPORT_PARAM,
      CreateEmptyTables: CREATE_EMPTY_PARAM,
      VsCurrency: { requiredType: 'string', isRequired: false, default: 'usd' },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'VsCurrency required' }));

    expect(latest.state?.manifest.parameters.ReimportLookbackWindow).toEqual(REIMPORT_PARAM);
    expect(latest.state?.manifest.parameters.CreateEmptyTables).toEqual(CREATE_EMPTY_PARAM);
    expect(latest.state?.manifest.parameters.VsCurrency.isRequired).toBe(true);
  });
});

describe('ParametersEditor — duplicate names', () => {
  // `commit` keys the manifest by name, so two rows called the same thing collapse to one
  // entry and the first row's whole configuration is gone. The row survives in local state,
  // so the table keeps showing both until a reload — the author has to be told which rows
  // are colliding rather than discovering the loss later.
  it('flags every row in a duplicate-name group', () => {
    renderWithParameters({});
    addParameter('VsCurrency');
    addParameter('VsCurrency');
    addParameter('Unique');

    expect(screen.getAllByLabelText('Duplicate parameter name')).toHaveLength(2);
  });

  it('counts duplicate rows in the toolbar invalid count, alongside blank names', () => {
    renderWithParameters({});
    addParameter('VsCurrency');
    addParameter('VsCurrency');
    // A third, still-unnamed row: the count has to cover both kinds of invalid row.
    fireEvent.click(screen.getAllByRole('button', { name: /add parameter/i })[0]);

    const editor = screen.getByTestId('parameters-editor');
    expect(within(editor).getByText('3')).toBeInTheDocument();
  });

  it('does not flag a name that appears only once', () => {
    renderWithParameters({
      VsCurrency: { requiredType: 'string', isRequired: false },
      Days: { requiredType: 'number', isRequired: false },
    });
    expect(screen.queryByLabelText('Duplicate parameter name')).toBeNull();
  });

  it('clears the flag once one of the colliding rows is renamed', () => {
    renderWithParameters({});
    addParameter('VsCurrency');
    addParameter('VsCurrency');
    expect(screen.getAllByLabelText('Duplicate parameter name')).toHaveLength(2);

    // Both rows show the same text, so drive the second one's cell directly.
    fireEvent.click(screen.getAllByText('VsCurrency')[1]);
    const textarea = screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA');
    if (!textarea) throw new Error('EditableText textarea not found');
    fireEvent.change(textarea, { target: { value: 'Days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByLabelText('Duplicate parameter name')).toBeNull();
    expect(Object.keys(latest.state?.manifest.parameters ?? {})).toEqual(['VsCurrency', 'Days']);
  });
});

// A parameter is a template token: {{ parameters.X }} may be referenced from request URLs,
// headers, query params and the auth block, and nothing rewrites or flags those references
// when it disappears. The old control was a bare trash icon that deleted on one click.
describe('ParametersEditor — row actions', () => {
  const paramNames = () => Object.keys(latest.state?.manifest.parameters ?? {});

  function openRowMenu(name: string) {
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete parameter/i }));
  }

  it('deletes through the kebab menu once the deletion is confirmed', () => {
    renderWithParameters({});
    addParameter('VsCurrency');
    addParameter('Days');

    openRowMenu('VsCurrency');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(paramNames()).toEqual(['Days']);
  });

  it('keeps the parameter while the confirmation is still open', () => {
    renderWithParameters({});
    addParameter('VsCurrency');

    openRowMenu('VsCurrency');

    expect(screen.getByText(/will stop resolving/i)).toBeInTheDocument();
    expect(paramNames()).toEqual(['VsCurrency']);
  });

  it('keeps the parameter when the confirmation is cancelled', () => {
    renderWithParameters({});
    addParameter('VsCurrency');

    openRowMenu('VsCurrency');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(paramNames()).toEqual(['VsCurrency']);
  });
});
