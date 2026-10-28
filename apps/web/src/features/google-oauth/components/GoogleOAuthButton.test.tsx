import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleOAuthButton } from './GoogleOAuthButton';

describe('GoogleOAuthButton', () => {
  it('adds a caller class to its own', () => {
    render(<GoogleOAuthButton className='mt-2'>Connect with Google</GoogleOAuthButton>);
    const button = screen.getByRole('button', { name: 'Connect with Google' });

    expect(button).toHaveClass('mt-2');
    expect(button).toHaveClass('w-full');
  });
});
