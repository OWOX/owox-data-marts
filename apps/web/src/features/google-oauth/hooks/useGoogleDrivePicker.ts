import { useCallback, useEffect, useRef } from 'react';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_SHEETS_PICKER_SCOPES = `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`;
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const PICKER_LOAD_TIMEOUT_MS = 10000;

export interface PickedGoogleSpreadsheet {
  id: string;
  name: string;
  url: string;
}

export interface OpenGoogleSheetsPickerOptions {
  apiKey: string;
  appId: string;
  clientId: string;
  hintEmail?: string;
  onPicked: (spreadsheet: PickedGoogleSpreadsheet) => void;
  onError?: (message: string) => void;
}

interface PickerDoc {
  id: string;
  name: string;
  url?: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}

interface DocsViewLike {
  setMimeTypes(mimeTypes: string): DocsViewLike;
  setMode(mode: unknown): DocsViewLike;
}

interface PickerBuilderLike {
  setOAuthToken(token: string): PickerBuilderLike;
  setDeveloperKey(key: string): PickerBuilderLike;
  setAppId(appId: string): PickerBuilderLike;
  addView(view: DocsViewLike): PickerBuilderLike;
  enableFeature(feature: unknown): PickerBuilderLike;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilderLike;
  build(): PickerInstanceLike;
}

interface PickerInstanceLike {
  setVisible(visible: boolean): void;
  dispose?: () => void;
}

interface GooglePicker {
  PickerBuilder: new () => PickerBuilderLike;
  DocsView: new (viewId?: unknown) => DocsViewLike;
  ViewId: { SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Action: { PICKED: string; CANCEL: string };
  Feature: { SUPPORT_DRIVES: unknown };
}

interface TokenClient {
  requestAccessToken(overrides?: { login_hint?: string }): void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  scope?: string;
}

export function validateGoogleSheetsPickerScopes(scope?: string): void {
  const grantedScopes = new Set((scope ?? '').split(/\s+/).filter(Boolean));
  const missingScopes = [DRIVE_FILE_SCOPE, USERINFO_EMAIL_SCOPE].filter(
    requiredScope => !grantedScopes.has(requiredScope)
  );
  if (missingScopes.length > 0) {
    throw new Error(
      'Google Sheets access was not fully granted. Reconnect and allow file and email access.'
    );
  }
}

interface GoogleAccountsOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
    login_hint?: string;
  }): TokenClient;
}

interface GapiGlobal {
  load(api: string, callback: () => void): void;
}

interface GooglePickerWindow {
  gapi?: GapiGlobal;
  google?: {
    picker?: GooglePicker;
    accounts?: { oauth2?: GoogleAccountsOauth2 };
  };
}

const googleWindow = window as unknown as GooglePickerWindow;

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      scriptPromises.delete(src);
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

function loadPicker(): Promise<void> {
  const loadGapi = googleWindow.gapi ? Promise.resolve() : loadScript(GAPI_SRC);
  return loadGapi.then(
    () =>
      new Promise<void>((resolve, reject) => {
        const gapi = googleWindow.gapi;
        if (!gapi) {
          reject(new Error('gapi failed to initialize'));
          return;
        }

        let settled = false;
        const timeoutId = window.setTimeout(() => {
          settled = true;
          reject(new Error('Google Picker failed to initialize. Please try again.'));
        }, PICKER_LOAD_TIMEOUT_MS);

        try {
          gapi.load('picker', () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            resolve();
          });
        } catch (error) {
          settled = true;
          window.clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error('Google Picker failed to initialize'));
        }
      })
  );
}

function requestAccessToken(clientId: string, hintEmail?: string): Promise<string> {
  const loadGis = googleWindow.google?.accounts?.oauth2 ? Promise.resolve() : loadScript(GIS_SRC);
  return loadGis.then(
    () =>
      new Promise<string>((resolve, reject) => {
        const oauth2 = googleWindow.google?.accounts?.oauth2;
        if (!oauth2) {
          reject(new Error('Google Identity Services failed to initialize'));
          return;
        }

        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SHEETS_PICKER_SCOPES,
          login_hint: hintEmail,
          callback: response => {
            if (response.access_token) {
              try {
                validateGoogleSheetsPickerScopes(response.scope);
              } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
              }
              resolve(response.access_token);
            } else {
              reject(new Error(response.error ?? 'Could not obtain a Google access token'));
            }
          },
          error_callback: error => {
            reject(new Error(error.message ?? 'Google authorization was cancelled'));
          },
        });
        client.requestAccessToken({ login_hint: hintEmail });
      })
  );
}

export async function verifyGooglePickerAccount(
  accessToken: string,
  expectedEmail?: string
): Promise<void> {
  if (!expectedEmail?.includes('@')) {
    throw new Error('Reconnect Google Sheets before choosing a spreadsheet');
  }

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Could not verify the Google account used by Google Picker');
  }

  const userInfo = (await response.json()) as { email?: string };
  if (userInfo.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(`Open Google Picker with the connected account ${expectedEmail}`);
  }
}

function buildPickerView(picker: GooglePicker) {
  return new picker.DocsView(picker.ViewId.SPREADSHEETS)
    .setMimeTypes(GOOGLE_SHEETS_MIME_TYPE)
    .setMode(picker.DocsViewMode.LIST);
}

function buildItemUrl(doc: PickerDoc): string {
  if (doc.url) {
    return doc.url;
  }
  return `https://docs.google.com/spreadsheets/d/${doc.id}/edit`;
}

export function useGoogleSheetsPicker() {
  const activePickerRef = useRef<PickerInstanceLike | null>(null);
  const pendingPickerResolveRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  const closeActivePicker = useCallback(() => {
    const picker = activePickerRef.current;
    activePickerRef.current = null;
    picker?.setVisible(false);
    picker?.dispose?.();

    const resolve = pendingPickerResolveRef.current;
    pendingPickerResolveRef.current = null;
    resolve?.();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      closeActivePicker();
    };
  }, [closeActivePicker]);

  const openPicker = useCallback(
    async (options: OpenGoogleSheetsPickerOptions): Promise<void> => {
      const { apiKey, appId, clientId, hintEmail, onPicked, onError } = options;

      try {
        closeActivePicker();
        await loadPicker();
        const token = await requestAccessToken(clientId, hintEmail);
        await verifyGooglePickerAccount(token, hintEmail);
        if (!isMountedRef.current) return;

        const picker = googleWindow.google?.picker;
        if (!picker) {
          throw new Error('Google Picker failed to initialize');
        }

        await new Promise<void>(resolve => {
          const settle = () => {
            if (pendingPickerResolveRef.current === settle) {
              pendingPickerResolveRef.current = null;
            }
            resolve();
          };
          const finish = () => {
            if (activePickerRef.current === builtPicker) {
              activePickerRef.current = null;
            }
            builtPicker.setVisible(false);
            builtPicker.dispose?.();
            settle();
          };

          const builtPicker = new picker.PickerBuilder()
            .setOAuthToken(token)
            .setDeveloperKey(apiKey)
            .setAppId(appId)
            .addView(buildPickerView(picker))
            .enableFeature(picker.Feature.SUPPORT_DRIVES)
            .setCallback(response => {
              if (!isMountedRef.current || activePickerRef.current !== builtPicker) {
                return;
              }

              if (response.action === picker.Action.PICKED) {
                const doc = response.docs?.[0];
                if (doc) {
                  onPicked({
                    id: doc.id,
                    name: doc.name,
                    url: buildItemUrl(doc),
                  });
                }
                finish();
              } else if (response.action === picker.Action.CANCEL) {
                finish();
              }
            })
            .build();

          activePickerRef.current = builtPicker;
          pendingPickerResolveRef.current = settle;
          builtPicker.setVisible(true);
        });
      } catch (error) {
        closeActivePicker();
        if (isMountedRef.current) {
          onError?.(
            error instanceof Error ? error.message : 'Failed to open the Google Sheets picker'
          );
        }
      }
    },
    [closeActivePicker]
  );

  return { openPicker };
}
