import { useEffect, useRef } from 'react';
import { useFlags } from '../store/hooks';
import { RequestStatus } from '../../shared/types/request-status';
import { useAuth, type User } from '../../features/idp';
import apiClient from '../api/apiClient';
import { resetIntercomLauncher } from './intercomUtils';

declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => void;
  }
}

interface IntercomPayload {
  app_id: string;
  user_id: string;
  email?: string;
  name?: string;
  Name_project?: string;
  intercom_user_jwt?: string;
}

const INTERCOM_APP_ID_FLAG = 'INTERCOM_APP_ID';
const INTERCOM_SCRIPT_ID = 'intercom-widget-script';

function isIntercomLoaded(): boolean {
  return Boolean(document.getElementById(INTERCOM_SCRIPT_ID));
}

function loadIntercomScript(appId: string, onLoad: () => void): void {
  if (isIntercomLoaded()) {
    onLoad();
    return;
  }
  const script = document.createElement('script');
  script.id = INTERCOM_SCRIPT_ID;
  script.src = `https://widget.intercom.io/widget/${appId}`;
  script.async = true;
  script.onload = () => {
    onLoad();
  };
  document.head.appendChild(script);
}

async function fetchIntercomJwt(): Promise<string | null> {
  try {
    const res = await apiClient.post<{ token: string }>('/intercom/jwt');
    return res.data.token;
  } catch (e) {
    console.warn('Failed to fetch Intercom JWT', e);
    return null;
  }
}

function buildIntercomPayload(appId: string, user: User): IntercomPayload {
  const payload: IntercomPayload = {
    app_id: appId,
    user_id: user.id,
  };

  if (user.email) {
    payload.email = user.email;
  }

  if (user.fullName) {
    payload.name = user.fullName;
  }

  if (user.projectTitle) {
    payload.Name_project = user.projectTitle;
  }

  return payload;
}

async function initializeIntercom(appId: string, user: User | null): Promise<void> {
  if (!user) return;

  const payload = buildIntercomPayload(appId, user);

  const token = await fetchIntercomJwt();
  if (!token) {
    // Do not boot without JWT per security policy
    return;
  }

  payload.intercom_user_jwt = token;

  try {
    if (window.Intercom) {
      window.Intercom('boot', payload);
    }
  } catch (err) {
    console.warn('Failed to boot Intercom', err);
  }
}

export function IntercomChat(): null {
  const { flags, callState } = useFlags();
  const { user } = useAuth();

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (callState !== RequestStatus.LOADED || !flags) return;

    const rawAppId = flags[INTERCOM_APP_ID_FLAG];
    const appId = (typeof rawAppId === 'string' ? rawAppId : '').trim();
    if (!appId) return; // Intercom disabled

    loadIntercomScript(appId, () => {
      void initializeIntercom(appId, user).then(() => {
        initializedRef.current = true;
        resetIntercomLauncher();
      });
    });
  }, [flags, callState, user]);

  return null;
}

export default IntercomChat;
