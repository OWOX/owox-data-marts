import { useCallback } from 'react';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const PICKER_SCOPES = `${DRIVE_FILE_SCOPE} ${USERINFO_EMAIL_SCOPE}`;
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

export type GoogleDrivePickerSelection = 'folder' | 'spreadsheet';

export interface PickedGoogleDriveItem {
  id: string;
  name: string;
  url: string;
}

export interface OpenGoogleDrivePickerOptions {
  apiKey: string;
  appId?: string;
  clientId: string;
  selection: GoogleDrivePickerSelection;
  hintEmail?: string;
  onPicked: (item: PickedGoogleDriveItem) => void;
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
  setSelectFolderEnabled(enabled: boolean): DocsViewLike;
  setIncludeFolders(include: boolean): DocsViewLike;
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
  build(): { setVisible(visible: boolean): void };
}

interface GooglePicker {
  PickerBuilder: new () => PickerBuilderLike;
  DocsView: new (viewId?: unknown) => DocsViewLike;
  ViewId: { FOLDERS: unknown; SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Action: { PICKED: string; CANCEL: string };
  Feature: { SUPPORT_DRIVES: unknown };
}

interface TokenClient {
  requestAccessToken(overrides?: { hint?: string }): void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  scope?: string;
}

interface GoogleAccountsOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
    hint?: string;
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
        if (!googleWindow.gapi) {
          reject(new Error('gapi failed to initialize'));
          return;
        }
        googleWindow.gapi.load('picker', resolve);
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
          scope: PICKER_SCOPES,
          hint: hintEmail,
          callback: response => {
            if (response.access_token) {
              const grantedScopes = new Set((response.scope ?? '').split(/\s+/).filter(Boolean));
              if (!grantedScopes.has(DRIVE_FILE_SCOPE)) {
                reject(
                  new Error(
                    'Google Drive file access was not granted. Reconnect and allow the requested permission.'
                  )
                );
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
        client.requestAccessToken({ hint: hintEmail });
      })
  );
}

export async function verifyGooglePickerAccount(
  accessToken: string,
  expectedEmail?: string
): Promise<void> {
  if (!expectedEmail?.includes('@')) {
    return;
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

function buildPickerView(picker: GooglePicker, selection: GoogleDrivePickerSelection) {
  if (selection === 'folder') {
    return new picker.DocsView(picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');
  }

  return new picker.DocsView(picker.ViewId.SPREADSHEETS)
    .setSelectFolderEnabled(false)
    .setIncludeFolders(false)
    .setMimeTypes(GOOGLE_SHEETS_MIME_TYPE)
    .setMode(picker.DocsViewMode.LIST);
}

function buildItemUrl(doc: PickerDoc, selection: GoogleDrivePickerSelection): string {
  if (doc.url) {
    return doc.url;
  }
  return selection === 'folder'
    ? `https://drive.google.com/drive/folders/${doc.id}`
    : `https://docs.google.com/spreadsheets/d/${doc.id}/edit`;
}

export function useGoogleDrivePicker() {
  const openPicker = useCallback(async (options: OpenGoogleDrivePickerOptions): Promise<void> => {
    const { apiKey, appId, clientId, selection, hintEmail, onPicked, onError } = options;

    try {
      await loadPicker();
      const token = await requestAccessToken(clientId, hintEmail);
      await verifyGooglePickerAccount(token, hintEmail);
      const picker = googleWindow.google?.picker;
      if (!picker) {
        throw new Error('Google Picker failed to initialize');
      }

      await new Promise<void>(resolve => {
        let builder = new picker.PickerBuilder()
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .addView(buildPickerView(picker, selection))
          .enableFeature(picker.Feature.SUPPORT_DRIVES)
          .setCallback(response => {
            if (response.action === picker.Action.PICKED) {
              const doc = response.docs?.[0];
              if (doc) {
                onPicked({
                  id: doc.id,
                  name: doc.name,
                  url: buildItemUrl(doc, selection),
                });
              }
              resolve();
            } else if (response.action === picker.Action.CANCEL) {
              resolve();
            }
          });

        if (appId) {
          builder = builder.setAppId(appId);
        }

        builder.build().setVisible(true);
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to open Google Picker');
    }
  }, []);

  return { openPicker };
}
