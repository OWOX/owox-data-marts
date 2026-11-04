import { useCallback, useEffect, useRef } from 'react';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_SHEETS_PICKER_SCOPES = `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`;
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const PICKER_LOAD_TIMEOUT_MS = 10000;
// Google Picker clamps the dialog to 566x350 .. 1051x650 and centres it in the window.
// Without an explicit size it uses the maximum, and in a short window the top of the
// dialog (title and search box) ends up above the viewport.
const PICKER_MIN_WIDTH = 566;
const PICKER_MIN_HEIGHT = 350;
const PICKER_MAX_WIDTH = 1051;
const PICKER_MAX_HEIGHT = 650;
const PICKER_VIEWPORT_MARGIN = 32;

export interface PickedGoogleSpreadsheet {
  id: string;
  name: string;
  url: string;
}

export interface OpenGoogleSheetsPickerOptions {
  apiKey: string;
  appId: string;
  /** Needed only without accessToken, to ask Google Identity Services for a token. */
  clientId?: string;
  /** A token Google already gave this page, so Picker opens without a Google popup. */
  accessToken?: string;
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
  setSize(width: number, height: number): PickerBuilderLike;
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

type TokenPrompt = 'none' | 'select_account';

interface TokenClient {
  requestAccessToken(overrides?: { login_hint?: string; prompt?: TokenPrompt }): void;
}

class GoogleSignInRequiredError extends Error {
  constructor(email?: string) {
    super(`Sign in to Google as ${email ?? 'the connected account'} to add spreadsheets.`);
  }
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

function loadGis(): Promise<void> {
  return googleWindow.google?.accounts?.oauth2 ? Promise.resolve() : loadScript(GIS_SRC);
}

/** Loads the Google scripts ahead of a click, so the token popup opens while the click still allows it. */
export function preloadGoogleSheetsPicker(): void {
  void Promise.all([loadGis(), loadPicker()]).catch(() => undefined);
}

function requestAccessToken(
  clientId: string,
  hintEmail: string | undefined,
  prompt: TokenPrompt
): Promise<string> {
  // A silent request that fails needs a screen, and only a new click may open one.
  const failed = (code?: string, message?: string) =>
    prompt === 'none' && code !== 'popup_failed_to_open'
      ? new GoogleSignInRequiredError(hintEmail)
      : new Error(message ?? code ?? 'Could not obtain a Google access token');
  return loadGis().then(
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
              reject(failed(response.error, response.error));
            }
          },
          error_callback: error => {
            reject(failed(error.type, error.message ?? 'Google authorization was cancelled'));
          },
        });
        client.requestAccessToken({ prompt, login_hint: hintEmail });
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

export function getPickerDialogSize(viewport: { innerWidth: number; innerHeight: number }): {
  width: number;
  height: number;
} {
  // Picker ignores anything below its minimum, so clamp to it rather than pretend.
  return {
    width: Math.max(
      PICKER_MIN_WIDTH,
      Math.min(PICKER_MAX_WIDTH, viewport.innerWidth - PICKER_VIEWPORT_MARGIN)
    ),
    height: Math.max(
      PICKER_MIN_HEIGHT,
      Math.min(PICKER_MAX_HEIGHT, viewport.innerHeight - PICKER_VIEWPORT_MARGIN)
    ),
  };
}

function buildPickerView(picker: GooglePicker) {
  return new picker.DocsView(picker.ViewId.SPREADSHEETS)
    .setMimeTypes(GOOGLE_SHEETS_MIME_TYPE)
    .setMode(picker.DocsViewMode.LIST);
}

/** The spreadsheet's edit URL from either its ID or an already complete URL. */
export function spreadsheetUrlFrom(idOrUrl: string): string {
  const value = idOrUrl.trim();
  return /^https?:\/\//i.test(value)
    ? value
    : `https://docs.google.com/spreadsheets/d/${value}/edit`;
}

function buildItemUrl(doc: PickerDoc): string {
  if (doc.url) {
    return doc.url;
  }
  return spreadsheetUrlFrom(doc.id);
}

export function useGoogleSheetsPicker() {
  const activePickerRef = useRef<PickerInstanceLike | null>(null);
  const pendingPickerResolveRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const generationRef = useRef(0);
  // After Google asked for a sign-in, the next click lets the member choose the account.
  const chooseAccountRef = useRef(false);

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
      const { apiKey, appId, clientId, accessToken, hintEmail, onPicked, onError } = options;
      // A newer open supersedes this one, so a double click builds a single Picker.
      const generation = ++generationRef.current;
      const superseded = () => !isMountedRef.current || generationRef.current !== generation;

      try {
        closeActivePicker();
        // The token popup goes first: a browser lets a click open a popup only for a short time.
        let tokenRequest: Promise<string>;
        if (accessToken) {
          tokenRequest = Promise.resolve(accessToken);
        } else if (clientId) {
          const prompt = chooseAccountRef.current ? 'select_account' : 'none';
          tokenRequest = requestAccessToken(clientId, hintEmail, prompt);
        } else {
          throw new Error('Google Picker configuration is incomplete');
        }
        const [token] = await Promise.all([tokenRequest, loadPicker()]);
        if (!accessToken) chooseAccountRef.current = false;
        if (superseded()) return;
        await verifyGooglePickerAccount(token, hintEmail);
        if (superseded()) return;

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

          const { width, height } = getPickerDialogSize(window);
          const builtPicker = new picker.PickerBuilder()
            .setOAuthToken(token)
            .setDeveloperKey(apiKey)
            .setAppId(appId)
            .addView(buildPickerView(picker))
            .enableFeature(picker.Feature.SUPPORT_DRIVES)
            .setSize(width, height)
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
        if (error instanceof GoogleSignInRequiredError) chooseAccountRef.current = true;
        // A superseded call must not close the Picker a newer one opened.
        if (superseded()) return;
        closeActivePicker();
        onError?.(
          error instanceof Error ? error.message : 'Failed to open the Google Sheets picker'
        );
      }
    },
    [closeActivePicker]
  );

  return { openPicker };
}
