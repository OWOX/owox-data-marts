import { useCallback } from 'react';

/**
 * Minimal hook to open the Google Drive Picker for selecting a FOLDER.
 *
 * Flow: dynamically load the Picker JS (`api.js`) + Google Identity Services
 * (`gsi/client`), obtain a fresh browser access token with the `drive.file`
 * scope via GIS (same OAuth client as the destination), then show the Picker
 * limited to folders (incl. Shared Drives). Selecting a folder grants the app
 * `drive.file` access to it, which is what lets the backend later create files
 * there under the destination's stored token.
 */

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface PickedDriveFolder {
  id: string;
  name: string;
  url: string;
}

export interface OpenDrivePickerOptions {
  apiKey: string;
  clientId: string;
  /** Pre-select the Google account that connected the destination. */
  hintEmail?: string;
  onPicked: (folder: PickedDriveFolder) => void;
  onError?: (message: string) => void;
}

// --- Minimal typings for the Google Picker + GIS globals we use ---
interface PickerDoc {
  id: string;
  name: string;
  url: string;
}
interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}
interface DocsViewLike {
  setSelectFolderEnabled(enabled: boolean): DocsViewLike;
  setIncludeFolders(include: boolean): DocsViewLike;
  setMimeTypes(mimeTypes: string): DocsViewLike;
}
interface PickerBuilderLike {
  setOAuthToken(token: string): PickerBuilderLike;
  setDeveloperKey(key: string): PickerBuilderLike;
  addView(view: DocsViewLike): PickerBuilderLike;
  enableFeature(feature: unknown): PickerBuilderLike;
  setCallback(cb: (response: PickerResponse) => void): PickerBuilderLike;
  build(): { setVisible(visible: boolean): void };
}
interface GooglePicker {
  PickerBuilder: new () => PickerBuilderLike;
  DocsView: new (viewId?: unknown) => DocsViewLike;
  ViewId: { FOLDERS: unknown };
  Action: { PICKED: string; CANCEL: string };
  Feature: { SUPPORT_DRIVES: unknown };
}
interface TokenClient {
  requestAccessToken(overrides?: { hint?: string }): void;
}
interface TokenResponse {
  access_token?: string;
  error?: string;
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

declare global {
  interface Window {
    gapi?: GapiGlobal;
    google?: {
      picker?: GooglePicker;
      accounts?: { oauth2?: GoogleAccountsOauth2 };
    };
  }
}

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
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

function loadPicker(): Promise<void> {
  return loadScript(GAPI_SRC).then(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!window.gapi) {
          reject(new Error('gapi failed to initialize'));
          return;
        }
        window.gapi.load('picker', () => {
          resolve();
        });
      })
  );
}

function requestAccessToken(clientId: string, hintEmail?: string): Promise<string> {
  return loadScript(GIS_SRC).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) {
          reject(new Error('Google Identity Services failed to initialize'));
          return;
        }
        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_FILE_SCOPE,
          hint: hintEmail,
          callback: (response: TokenResponse) => {
            if (response.access_token) {
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

export function useGoogleDrivePicker() {
  const openPicker = useCallback(async (options: OpenDrivePickerOptions): Promise<void> => {
    const { apiKey, clientId, hintEmail, onPicked, onError } = options;
    try {
      await loadPicker();
      const token = await requestAccessToken(clientId, hintEmail);

      const picker = window.google?.picker;
      if (!picker) {
        throw new Error('Google Picker failed to initialize');
      }

      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const built = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .addView(view)
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setCallback((response: PickerResponse) => {
          const doc = response.action === picker.Action.PICKED ? response.docs?.[0] : undefined;
          if (doc) {
            onPicked({ id: doc.id, name: doc.name, url: doc.url });
          }
        })
        .build();
      built.setVisible(true);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to open the Google folder picker');
    }
  }, []);

  return { openPicker };
}
