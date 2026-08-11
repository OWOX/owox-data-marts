import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import { ConnectorVersionControl } from './ConnectorVersionControl';

const getById = vi.fn();
vi.mock('../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    getById = getById;
  },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const custom = (version: number | undefined): ConnectorListItem => ({
  name: 'Acme',
  displayName: 'Acme',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'c1',
  version, // active version
});

beforeEach(() => {
  getById.mockReset();
  getById.mockResolvedValue({
    id: 'c1',
    name: 'Acme',
    title: 'Acme',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: 'v5',
    activeVersion: 5,
    versions: [
      { version: 5, status: 'published', publishedAt: '2026-01-01' },
      { version: 4, status: 'draft', publishedAt: null },
      { version: 3, status: 'published', publishedAt: '2025-12-01' },
    ],
  });
});

it('renders nothing for a bundled (non-custom) connector', () => {
  const { container } = render(
    <ConnectorVersionControl
      info={{
        name: 'Facebook',
        displayName: 'Facebook',
        description: '',
        logoBase64: null,
        docUrl: null,
      }}
      version={undefined}
      onChangeVersion={vi.fn()}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

it('shows "Following active" when not pinned', () => {
  render(
    <ConnectorVersionControl info={custom(5)} version={undefined} onChangeVersion={vi.fn()} />
  );
  expect(screen.getByTestId('connector-version-badge')).toHaveTextContent('Following active · v5');
  expect(screen.queryByText('update available')).toBeNull();
});

it('shows "(active)" when pinned to the active version', () => {
  render(<ConnectorVersionControl info={custom(5)} version={5} onChangeVersion={vi.fn()} />);
  expect(screen.getByTestId('connector-version-badge')).toHaveTextContent('Pinned · v5 (active)');
  expect(screen.queryByText('update available')).toBeNull();
});

it('shows "update available" when pinned to a stale version', () => {
  render(<ConnectorVersionControl info={custom(5)} version={3} onChangeVersion={vi.fn()} />);
  const badge = screen.getByTestId('connector-version-badge');
  expect(badge).toHaveTextContent('Pinned · v3');
  expect(badge).toHaveTextContent('update available');
});

it('lists only published versions in the picker and pins on click', async () => {
  const onChange = vi.fn();
  render(
    <ConnectorVersionControl info={custom(5)} version={undefined} onChangeVersion={onChange} />
  );
  fireEvent.click(screen.getByTestId('connector-version-badge'));
  await waitFor(() => {
    expect(getById).toHaveBeenCalledWith('c1');
  });
  expect(await screen.findByRole('button', { name: 'Pin to version 3' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pin to version 5' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pin to version 4' })).toBeNull(); // draft excluded
  fireEvent.click(screen.getByRole('button', { name: 'Pin to version 3' }));
  expect(onChange).toHaveBeenCalledWith(3);
});

it('clears the pin via Follow active', async () => {
  const onChange = vi.fn();
  render(<ConnectorVersionControl info={custom(5)} version={3} onChangeVersion={onChange} />);
  fireEvent.click(screen.getByTestId('connector-version-badge'));
  fireEvent.click(await screen.findByRole('button', { name: 'Follow active' }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});

it('offers an explicit "Pin to active" on a stale pin', async () => {
  const onChange = vi.fn();
  render(<ConnectorVersionControl info={custom(5)} version={3} onChangeVersion={onChange} />);
  fireEvent.click(screen.getByTestId('connector-version-badge'));
  fireEvent.click(await screen.findByRole('button', { name: 'Pin to active version 5' }));
  expect(onChange).toHaveBeenCalledWith(5);
});
