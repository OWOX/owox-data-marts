import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPersonalDataExport,
  downloadPersonalData,
  type PersonalData,
} from './account-data-export';
import { downloadPersonalDataByLink, parseAccountLink } from './account-link.service';
import { downloadBlob } from '../data-marts/model-canvas/export/download';
import { getAccountPersonalData } from './account-profile.service';

vi.mock('../data-marts/model-canvas/export/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('./account-profile.service', () => ({ getAccountPersonalData: vi.fn() }));

const data: PersonalData = {
  account: 'anna@example.test',
  email: 'work@example.test',
  name: 'Anna',
  phone: '',
  companyName: 'Company',
  companyWebsite: 'https://example.test',
  policyInteraction: 'with_projects',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Personal data export', () => {
  it('keeps the disclosure sections, company fields and filename from Platform', async () => {
    vi.mocked(getAccountPersonalData).mockResolvedValue(data);
    const session = { userId: 'user-1', projectId: 'project-1' };
    await downloadPersonalData('https://ib.example.test', session);
    expect(getAccountPersonalData).toHaveBeenCalledWith('https://ib.example.test', session);
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
    expect(filename).toBe('user_info.json');
    const json = JSON.parse(await blob.text()) as Record<string, unknown>;
    expect(Object.keys(json)).toHaveLength(5);
    expect(json['The categories and specific pieces of personal information']).toEqual({
      account: data.account,
      name: data.name,
      email: data.email,
      phone: '',
      'company-name': 'Company',
      'company-website': 'https://example.test',
    });
    expect(
      json['The business or commercial purpose for collecting or selling personal information']
    ).toContain('technical support');
  });

  it.each([
    ['inactive', false, false],
    ['with_projects', true, false],
    ['with_email_subscriptions', false, true],
    ['with_projects_and_email_subscriptions', true, true],
  ] as const)('preserves the %s policy category', (policyInteraction, projects, emails) => {
    const json = buildPersonalDataExport({ ...data, policyInteraction });
    const purpose =
      json['The business or commercial purpose for collecting or selling personal information']!;
    expect(purpose.includes('technical support')).toBe(projects);
    expect(purpose.includes('news and offers')).toBe(emails);
  });

  it('keeps signed export omissions and sends proof only in a POST body, without the App token', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        ...data,
        phone: null,
        companyName: null,
        companyWebsite: null,
        policyInteraction: null,
      })
    );
    vi.stubGlobal('fetch', fetch);
    const link = { email: 'anna+test@example.test', signature: 'legacy-proof' };
    await downloadPersonalDataByLink('https://ib.example.test', link);
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://ib.example.test/api/account/personal-data/export'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(link),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
    );
    const [blob] = vi.mocked(downloadBlob).mock.calls[0];
    const json = JSON.parse(await blob.text()) as Record<string, unknown>;
    expect(Object.keys(json)).toHaveLength(4);
    expect(json['The categories and specific pieces of personal information']).toEqual({
      account: data.account,
      email: data.email,
      name: data.name,
    });
  });

  it('does not download an error response or an unrecognized policy category', async () => {
    vi.mocked(getAccountPersonalData)
      .mockRejectedValueOnce(new Error('Account request failed'))
      .mockResolvedValueOnce({ ...data, policyInteraction: 'unknown' });
    const session = { userId: 'user-1', projectId: 'project-1' };
    await expect(downloadPersonalData('https://ib.example.test', session)).rejects.toThrow();
    await expect(downloadPersonalData('https://ib.example.test', session)).rejects.toThrow();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('decodes email once and keeps the exact expiry text for signature verification', () => {
    const parsed = parseAccountLink(
      new URLSearchParams(
        'email=anna%2Btest%40example.test&hash=proof&expires_date=2030-01-02T12%3A00%3A00%2B02%3A00'
      ),
      'subscriptions'
    );
    expect(parsed.success && parsed.data).toEqual({
      email: 'anna+test@example.test',
      signature: 'proof',
      topicId: 'all',
      expiresAt: '2030-01-02T12:00:00+02:00',
    });
  });
});
