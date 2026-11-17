import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeRoleHint } from './ChangeRoleHint';

const getMembers = vi.hoisted(() => vi.fn());

vi.mock('../../services/project-members.service', () => ({
  projectMembersService: { getMembers },
}));

function renderHint() {
  return render(
    <MemoryRouter>
      <p data-testid='hint'>
        <ChangeRoleHint to='/members' />
      </p>
    </MemoryRouter>
  );
}

describe('ChangeRoleHint', () => {
  beforeEach(() => {
    getMembers.mockResolvedValue([
      { userId: 'u1', displayName: 'Anna Admin', email: 'anna@example.com', role: 'admin' },
      { userId: 'u2', displayName: 'Oleh Owner', email: 'oleh@example.com', role: 'editor' },
    ]);
  });

  it('renders the hint with a link to Members', () => {
    renderHint();

    expect(screen.getByTestId('hint').textContent).toBe(
      'A Project Admin can change your role in Project settings → Members.'
    );
    expect(
      screen.getByRole('link', { name: 'Project settings → Members' }).getAttribute('href')
    ).toBe('/members');
  });

  it('lists the Project Admins on hover', async () => {
    renderHint();

    fireEvent.pointerEnter(screen.getByText('A Project Admin'));

    expect(await screen.findByText('Anna Admin')).toBeTruthy();
    expect(screen.queryByText('Oleh Owner')).toBeNull();
  });

  it('can be focused from the keyboard', () => {
    renderHint();

    expect(screen.getByText('A Project Admin').getAttribute('tabindex')).toBe('0');
  });
});
