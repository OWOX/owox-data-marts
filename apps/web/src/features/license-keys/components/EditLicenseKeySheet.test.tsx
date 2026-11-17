import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditLicenseKeySheet } from './EditLicenseKeySheet';
import type { LicenseKey } from '../types';

const licenseKey: LicenseKey = {
  licenseKeyId: 'k1',
  name: 'Key one',
  origin: 'https://odm.example.com',
  expiresAt: '2099-01-01T00:00:00Z',
  lastUsedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  createdByUser: null,
};

function renderSheet(link?: string | null) {
  return render(
    <EditLicenseKeySheet
      licenseKey={licenseKey}
      link={link}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onRevoke={vi.fn()}
    />
  );
}

describe('EditLicenseKeySheet', () => {
  it('shows Copy link only when it gets a link', () => {
    const { unmount } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Copy link to this license key' })).toBeNull();
    unmount();

    renderSheet('https://app.test/ui/p1/project-settings/license-keys?licenseKey=k1');
    expect(
      screen.getByRole('button', { name: 'Copy link to this license key' })
    ).toBeInTheDocument();
  });
});
