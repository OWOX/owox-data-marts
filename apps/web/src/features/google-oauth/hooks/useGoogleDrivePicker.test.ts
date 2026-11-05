// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPickerDialogSize,
  useGoogleSheetsPicker,
  validateGoogleSheetsPickerScopes,
  verifyGooglePickerAccount,
} from './useGoogleDrivePicker';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

describe('validateGoogleSheetsPickerScopes', () => {
  it('accepts the required Picker permissions', () => {
    expect(() => {
      validateGoogleSheetsPickerScopes(`${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`);
    }).not.toThrow();
  });

  it('rejects a partial Google grant', () => {
    expect(() => {
      validateGoogleSheetsPickerScopes(USERINFO_EMAIL_SCOPE);
    }).toThrow('Google Sheets access was not fully granted');
  });
});

describe('getPickerDialogSize', () => {
  it('uses the Picker maximum in a large window', () => {
    expect(getPickerDialogSize({ innerWidth: 1920, innerHeight: 1080 })).toEqual({
      width: 1051,
      height: 650,
    });
  });

  it('shrinks the dialog to a short or narrow window so the header stays visible', () => {
    expect(getPickerDialogSize({ innerWidth: 960, innerHeight: 560 })).toEqual({
      width: 928,
      height: 528,
    });
  });

  it('never goes below the size Picker itself enforces', () => {
    expect(getPickerDialogSize({ innerWidth: 400, innerHeight: 300 })).toEqual({
      width: 566,
      height: 350,
    });
  });
});

describe('verifyGooglePickerAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires connected-account metadata', async () => {
    await expect(verifyGooglePickerAccount('access-token')).rejects.toThrow(
      'Reconnect Google Sheets before choosing a spreadsheet'
    );
  });

  it('accepts the same Google account case-insensitively', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'Analyst@Example.com' }), { status: 200 })
    );

    await expect(
      verifyGooglePickerAccount('access-token', 'analyst@example.com')
    ).resolves.toBeUndefined();
  });

  it('rejects a Picker token issued for a different Google account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'other@example.com' }), { status: 200 })
    );

    await expect(verifyGooglePickerAccount('access-token', 'analyst@example.com')).rejects.toThrow(
      'Open Google Picker with the connected account analyst@example.com'
    );
  });
});

describe('useGoogleSheetsPicker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as { gapi?: unknown }).gapi;
    delete (window as unknown as { google?: unknown }).google;
  });

  it('reports when the Picker module does not initialize', async () => {
    vi.useFakeTimers();
    (window as unknown as { gapi: { load: () => void } }).gapi = {
      load: vi.fn(),
    };
    // Google Identity Services answers nothing, so only the Picker module can fail here.
    (window as unknown as { google: Record<string, unknown> }).google = {
      accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: vi.fn() }) } },
    };
    const onError = vi.fn();
    const { result } = renderHook(() => useGoogleSheetsPicker());

    const opening = result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      clientId: 'client-id',
      onPicked: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10000);
    await opening;

    expect(onError).toHaveBeenCalledWith('Google Picker failed to initialize. Please try again.');
  });

  it('closes the active Picker when the component unmounts', async () => {
    const setVisible = vi.fn();
    const dispose = vi.fn();
    const onPicked = vi.fn();
    let pickerCallback: ((response: { action: string; docs?: unknown[] }) => void) | undefined;
    let pickerSize: { width: number; height: number } | undefined;
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn(
      (config: { callback: (response: Record<string, unknown>) => void }) => {
        requestAccessToken.mockImplementation(() => {
          config.callback({
            access_token: 'access-token',
            scope: `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`,
          });
        });
        return { requestAccessToken };
      }
    );

    class DocsView {
      setMimeTypes() {
        return this;
      }
      setMode() {
        return this;
      }
    }

    class PickerBuilder {
      setOAuthToken() {
        return this;
      }
      setDeveloperKey() {
        return this;
      }
      setAppId() {
        return this;
      }
      addView() {
        return this;
      }
      enableFeature() {
        return this;
      }
      setSize(width: number, height: number) {
        pickerSize = { width, height };
        return this;
      }
      setCallback(callback: (response: { action: string; docs?: unknown[] }) => void) {
        pickerCallback = callback;
        return this;
      }
      build() {
        return { setVisible, dispose };
      }
    }

    (window as unknown as { gapi: { load: (_api: string, callback: () => void) => void } }).gapi = {
      load: (_api, callback) => {
        callback();
      },
    };
    (
      window as unknown as {
        google: {
          accounts: { oauth2: { initTokenClient: typeof initTokenClient } };
          picker: Record<string, unknown>;
        };
      }
    ).google = {
      accounts: { oauth2: { initTokenClient } },
      picker: {
        PickerBuilder,
        DocsView,
        ViewId: { SPREADSHEETS: 'spreadsheets' },
        DocsViewMode: { LIST: 'list' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        Feature: { SUPPORT_DRIVES: 'support-drives' },
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'analyst@example.com' }), { status: 200 })
    );

    const { result, unmount } = renderHook(() => useGoogleSheetsPicker());
    const opening = result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      clientId: 'client-id',
      hintEmail: 'analyst@example.com',
      onPicked,
    });

    await vi.waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(true);
    });
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: 'analyst@example.com' })
    );
    expect(requestAccessToken).toHaveBeenCalledWith({
      prompt: 'none',
      login_hint: 'analyst@example.com',
    });
    expect(pickerSize).toEqual(getPickerDialogSize(window));

    unmount();
    await opening;

    expect(setVisible).toHaveBeenLastCalledWith(false);
    expect(dispose).toHaveBeenCalledOnce();

    pickerCallback?.({
      action: 'picked',
      docs: [{ id: 'sheet-id', name: 'Sheet', url: 'https://example.com' }],
    });
    expect(onPicked).not.toHaveBeenCalled();
  });

  function mockPickerApi() {
    const setOAuthToken = vi.fn();
    const setVisible = vi.fn();
    const PickerBuilder = vi.fn(function (this: Record<string, unknown>) {
      const chain = () => this;
      Object.assign(this, {
        setOAuthToken: (token: string) => {
          setOAuthToken(token);
          return this;
        },
        setDeveloperKey: chain,
        setAppId: chain,
        addView: chain,
        enableFeature: chain,
        setSize: chain,
        setCallback: chain,
        build: () => ({ setVisible }),
      });
    });
    class DocsView {
      setMimeTypes() {
        return this;
      }
      setMode() {
        return this;
      }
    }
    // Each GIS request waits until the test answers it with respond(index, response).
    interface TokenConfig {
      callback: (response: Record<string, unknown>) => void;
      error_callback?: (error: { type?: string; message?: string }) => void;
    }
    const tokenConfigs: TokenConfig[] = [];
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: TokenConfig) => ({
      requestAccessToken: (overrides: unknown) => {
        requestAccessToken(overrides);
        tokenConfigs.push(config);
      },
    }));
    const respond = (index: number, response: Record<string, unknown>) => {
      tokenConfigs[index].callback(response);
    };
    const fail = (index: number, error: { type?: string; message?: string }) => {
      tokenConfigs[index].error_callback?.(error);
    };
    const granted = (token: string) => ({
      access_token: token,
      scope: `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`,
    });
    (window as unknown as { gapi: { load: (_api: string, callback: () => void) => void } }).gapi = {
      load: (_api, callback) => {
        callback();
      },
    };
    (window as unknown as { google: Record<string, unknown> }).google = {
      accounts: { oauth2: { initTokenClient } },
      picker: {
        PickerBuilder,
        DocsView,
        ViewId: { SPREADSHEETS: 'spreadsheets' },
        DocsViewMode: { LIST: 'list' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        Feature: { SUPPORT_DRIVES: 'support-drives' },
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ email: 'a@example.com' }), { status: 200 }))
    );
    return { setOAuthToken, setVisible, PickerBuilder, requestAccessToken, respond, fail, granted };
  }

  const gisOpen = {
    apiKey: 'api-key',
    appId: 'project-number',
    clientId: 'client-id',
    hintEmail: 'a@example.com',
  };

  it('builds one Picker for two rapid opens and settles the older one', async () => {
    const { setOAuthToken, setVisible, PickerBuilder, requestAccessToken, respond, granted } =
      mockPickerApi();
    const { result } = renderHook(() => useGoogleSheetsPicker());
    const onFirstError = vi.fn();

    const first = result.current.openPicker({
      ...gisOpen,
      onPicked: vi.fn(),
      onError: onFirstError,
    });
    // The second click lands while the first still waits for its token.
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
    });
    void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(2);
    });

    respond(1, granted('second-token'));
    await vi.waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(true);
    });
    respond(0, granted('first-token'));
    await first;

    expect(PickerBuilder).toHaveBeenCalledOnce();
    expect(setOAuthToken).toHaveBeenCalledWith('second-token');
    expect(setOAuthToken).not.toHaveBeenCalledWith('first-token');
    expect(setVisible).not.toHaveBeenCalledWith(false);
    expect(onFirstError).not.toHaveBeenCalled();
  });

  it("opens Picker with the sign-in popup's token and never loads Google Identity Services", async () => {
    const { setOAuthToken, setVisible } = mockPickerApi();
    // Without GIS on the page, any token request would inject its script.
    delete (window as unknown as { google: { accounts?: unknown } }).google.accounts;
    const { result } = renderHook(() => useGoogleSheetsPicker());

    void result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      accessToken: 'popup-token',
      hintEmail: 'a@example.com',
      onPicked: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(true);
    });
    expect(setOAuthToken).toHaveBeenCalledWith('popup-token');
    expect(
      document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    ).toBeNull();
  });

  it.each([
    'interaction_required',
    'consent_required',
    'login_required',
    'account_selection_required',
  ])(
    'on %s asks the member to sign in, then lets the next click choose the account',
    async error => {
      const { setOAuthToken, PickerBuilder, requestAccessToken, respond, granted } =
        mockPickerApi();
      const onError = vi.fn();
      const { result } = renderHook(() => useGoogleSheetsPicker());

      const first = result.current.openPicker({ ...gisOpen, onPicked: vi.fn(), onError });
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, { error });
      await first;

      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'none',
        login_hint: 'a@example.com',
      });
      expect(onError).toHaveBeenCalledWith(
        'Sign in to Google as a@example.com to add spreadsheets.'
      );
      expect(PickerBuilder).not.toHaveBeenCalled();
      // No retry without a click: the browser would block the popup.
      expect(requestAccessToken).toHaveBeenCalledTimes(1);

      void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'select_account',
        login_hint: 'a@example.com',
      });
      respond(1, granted('chosen-token'));
      await vi.waitFor(() => {
        expect(setOAuthToken).toHaveBeenCalledWith('chosen-token');
      });

      // Once Google gave a token, a later click is silent again.
      void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(3);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'none',
        login_hint: 'a@example.com',
      });
    }
  );

  describe('choose-account state', () => {
    const accountIs = (email: string, status = 200) => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ email }), { status }))
      );
    };
    const open = (hintEmail: string) => {
      const onError = vi.fn();
      return { onError, options: { ...gisOpen, hintEmail, onPicked: vi.fn(), onError } };
    };

    it('keeps asking for the account after the form is remounted', async () => {
      const { requestAccessToken, respond } = mockPickerApi();
      const first = renderHook(() => useGoogleSheetsPicker());
      const firstOpen = first.result.current.openPicker(open('remount@example.com').options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, { error: 'interaction_required' });
      await firstOpen;
      first.unmount();

      const second = renderHook(() => useGoogleSheetsPicker());
      void second.result.current.openPicker(open('remount@example.com').options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'select_account',
        login_hint: 'remount@example.com',
      });
    });

    it('keeps asking after a token for another account, until a verified token arrives', async () => {
      const { requestAccessToken, respond, granted, setOAuthToken } = mockPickerApi();
      accountIs('other@example.com');
      const { result } = renderHook(() => useGoogleSheetsPicker());
      const wrong = open('wrong@example.com');

      const firstOpen = result.current.openPicker(wrong.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, granted('wrong-token'));
      await firstOpen;
      expect(wrong.onError).toHaveBeenCalledWith(
        'Open Google Picker with the connected account wrong@example.com'
      );

      accountIs('wrong@example.com');
      void result.current.openPicker(wrong.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'select_account',
        login_hint: 'wrong@example.com',
      });
      respond(1, granted('right-token'));
      await vi.waitFor(() => {
        expect(setOAuthToken).toHaveBeenCalledWith('right-token');
      });

      void result.current.openPicker(wrong.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(3);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'none',
        login_hint: 'wrong@example.com',
      });
    });

    it('ends the state when the sign-in popup token passes the account check', async () => {
      const { requestAccessToken, respond, setVisible } = mockPickerApi();
      accountIs('popup@example.com');
      const { result } = renderHook(() => useGoogleSheetsPicker());
      const popup = open('popup@example.com');

      const signIn = result.current.openPicker(popup.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, { error: 'interaction_required' });
      await signIn;

      void result.current.openPicker({ ...popup.options, accessToken: 'popup-token' });
      await vi.waitFor(() => {
        expect(setVisible).toHaveBeenCalledWith(true);
      });

      void result.current.openPicker(popup.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'none',
        login_hint: 'popup@example.com',
      });
    });

    it('stays silent after a failed account check', async () => {
      const { requestAccessToken, respond, granted } = mockPickerApi();
      accountIs('unverified@example.com', 500);
      const { result } = renderHook(() => useGoogleSheetsPicker());
      const unverified = open('unverified@example.com');

      const firstOpen = result.current.openPicker(unverified.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, granted('token'));
      await firstOpen;
      expect(unverified.onError).toHaveBeenCalledWith(
        'Could not verify the Google account used by Google Picker'
      );

      void result.current.openPicker(unverified.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'none',
        login_hint: 'unverified@example.com',
      });
    });

    it('keeps asking when the account check of a chosen token fails', async () => {
      const { requestAccessToken, respond, granted } = mockPickerApi();
      accountIs('check@example.com', 500);
      const { result } = renderHook(() => useGoogleSheetsPicker());
      const check = open('check@example.com');

      const signIn = result.current.openPicker(check.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
      });
      respond(0, { error: 'interaction_required' });
      await signIn;

      const chosen = result.current.openPicker(check.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(2);
      });
      respond(1, granted('token'));
      await chosen;

      void result.current.openPicker(check.options);
      await vi.waitFor(() => {
        expect(requestAccessToken).toHaveBeenCalledTimes(3);
      });
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: 'select_account',
        login_hint: 'check@example.com',
      });
    });
  });

  it('treats a closed silent window like a sign-in request', async () => {
    const { requestAccessToken, fail, respond, granted, setOAuthToken } = mockPickerApi();
    const onError = vi.fn();
    const { result } = renderHook(() => useGoogleSheetsPicker());

    const first = result.current.openPicker({ ...gisOpen, onPicked: vi.fn(), onError });
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
    });
    fail(0, { type: 'popup_closed', message: 'Popup window closed' });
    await first;

    expect(onError).toHaveBeenCalledWith('Sign in to Google as a@example.com to add spreadsheets.');
    void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(2);
    });
    expect(requestAccessToken).toHaveBeenLastCalledWith({
      prompt: 'select_account',
      login_hint: 'a@example.com',
    });
    // A verified token ends the choose-account state, which lives beyond this test.
    respond(1, granted('chosen-token'));
    await vi.waitFor(() => {
      expect(setOAuthToken).toHaveBeenCalledWith('chosen-token');
    });
  });

  it('reports a blocked popup as it is and keeps the next request silent', async () => {
    const { requestAccessToken, fail } = mockPickerApi();
    const onError = vi.fn();
    const { result } = renderHook(() => useGoogleSheetsPicker());

    const first = result.current.openPicker({ ...gisOpen, onPicked: vi.fn(), onError });
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
    });
    fail(0, { type: 'popup_failed_to_open', message: 'Failed to open popup window' });
    await first;

    expect(onError).toHaveBeenCalledWith('Failed to open popup window');
    void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(2);
    });
    expect(requestAccessToken).toHaveBeenLastCalledWith({
      prompt: 'none',
      login_hint: 'a@example.com',
    });
  });

  it('asks Google for the token before the Picker script loads', async () => {
    const { requestAccessToken } = mockPickerApi();
    const load = vi.fn();
    (window as unknown as { gapi: { load: typeof load } }).gapi = { load };
    const { result } = renderHook(() => useGoogleSheetsPicker());

    void result.current.openPicker({ ...gisOpen, onPicked: vi.fn() });

    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
    });
    // The Picker module has not reported ready, yet the popup request already went out.
    expect(load).toHaveBeenCalledOnce();
  });

  it('needs a client ID when no token is given', async () => {
    mockPickerApi();
    const onError = vi.fn();
    const { result } = renderHook(() => useGoogleSheetsPicker());

    await result.current.openPicker({
      apiKey: 'api-key',
      appId: 'project-number',
      hintEmail: 'a@example.com',
      onPicked: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith('Google Picker configuration is incomplete');
  });
});
