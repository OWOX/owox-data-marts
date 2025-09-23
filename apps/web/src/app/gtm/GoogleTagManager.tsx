import { useEffect } from 'react';
import { useFlags } from '../store/hooks';
import { RequestStatus } from '../../shared/types/request-status.ts';

const GTM_SCRIPT_ID = 'gtm-script';
const GTM_NOSCRIPT_ID = 'gtm-noscript';
const GTM_CONTAINER_ID_FLAG = 'GOOGLE_TAG_MANAGER_CONTAINER_ID';

function isGTMAlreadyInstalled(): boolean {
  return Boolean(document.getElementById(GTM_SCRIPT_ID));
}

function createGTMScript(containerId: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.id = GTM_SCRIPT_ID;
  script.innerHTML = `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${containerId}');
  `;
  return script;
}

function createGTMNoScript(containerId: string): HTMLElement {
  const noscript = document.createElement('noscript');
  noscript.id = GTM_NOSCRIPT_ID;
  noscript.innerHTML = `
    <iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}" 
            height="0" 
            width="0" 
            style="display:none;visibility:hidden">
    </iframe>
  `;
  return noscript;
}

function insertGTMScript(containerId: string): void {
  if (isGTMAlreadyInstalled()) return;

  const script = createGTMScript(containerId);
  document.head.prepend(script);
}

function insertGTMNoScript(containerId: string): void {
  if (document.getElementById(GTM_NOSCRIPT_ID)) return;

  const noscript = createGTMNoScript(containerId);
  if (document.body.firstChild) {
    document.body.insertBefore(noscript, document.body.firstChild);
  } else {
    document.body.appendChild(noscript);
  }
}

function initializeGTM(containerId: string): void {
  try {
    insertGTMScript(containerId);
    insertGTMNoScript(containerId);
  } catch (error) {
    console.warn('Failed to initialize Google Tag Manager:', error);
  }
}

function extractContainerId(flags: Record<string, unknown>): string {
  const containerId = flags[GTM_CONTAINER_ID_FLAG] as string | undefined;
  return (containerId ?? '').trim();
}

export function GoogleTagManager(): null {
  const { flags, callState } = useFlags();

  useEffect(() => {
    if (callState !== RequestStatus.LOADED || !flags) return;

    const containerId = extractContainerId(flags);
    if (!containerId) return;

    initializeGTM(containerId);
  }, [flags, callState]);

  return null;
}

export default GoogleTagManager;
