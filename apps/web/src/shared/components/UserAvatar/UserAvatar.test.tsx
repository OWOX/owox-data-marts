import { fireEvent, render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar.tsx';

describe('UserAvatar', () => {
  it('tries to load a new avatar after the previous URL fails', () => {
    const { rerender } = render(
      <UserAvatar avatar='broken-avatar' initials='JD' displayName='John Doe' />
    );

    fireEvent.error(screen.getByRole('img', { name: 'John Doe' }));
    expect(screen.getByText('JD')).toBeInTheDocument();

    rerender(<UserAvatar avatar='valid-avatar' initials='JD' displayName='John Doe' />);

    expect(screen.getByRole('img', { name: 'John Doe' })).toHaveAttribute('src', 'valid-avatar');
  });
});
