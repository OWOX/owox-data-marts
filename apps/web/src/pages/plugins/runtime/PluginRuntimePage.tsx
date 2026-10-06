import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router';
import {
  appendRoute,
  canonicalPluginRoute,
  createPluginHostBridge,
  fetchRuntimeToken,
  PluginPageMessage,
  pluginsService,
  routeFromLocation,
  useCopyLink,
} from '../../../features/plugins';
import { useAuth } from '../../../features/idp';
import { useProjectId, useProjectRoute } from '../../../shared/hooks';

/**
 * Exactly two sandbox tokens, and never a third.
 *
 * Omitting allow-same-origin forces an opaque origin, which is what keeps the plugin
 * away from cookies, storage and this document. Adding it back while allow-scripts is
 * present is the classic sandbox escape, so the value is asserted in a test rather than
 * left to review.
 */
const SANDBOX = 'allow-scripts allow-downloads';
/** Address updates trail a burst of route reports; WebKit allows only ~100 replaceState calls per 30 s. */
const ADDRESS_SYNC_DELAY_MS = 350;

export function PluginRuntime({
  installationId,
  initialRoute,
  openBase,
}: {
  installationId: string;
  initialRoute: string;
  openBase: string;
}) {
  const projectId = useProjectId();
  const { scope } = useProjectRoute();
  const { user } = useAuth();
  // A token refresh hands out a new user object; only the id may restart the plugin.
  const userId = user?.id;
  const navigate = useNavigate();
  // A non-data router hands out a new navigate on every location change; a ref keeps the bridge.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const { copyLink, fallbackDialog } = useCopyLink();
  const copyLinkRef = useRef(copyLink);
  copyLinkRef.current = copyLink;
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** Set when the bridge closes the channel itself, e.g. a failed handshake. */
  const [broken, setBroken] = useState(false);

  const lastRouteRef = useRef(initialRoute);
  const routeInstallationRef = useRef(installationId);
  if (routeInstallationRef.current !== installationId) {
    routeInstallationRef.current = installationId;
    lastRouteRef.current = initialRoute;
  }
  const addressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(addressTimerRef.current);
      addressTimerRef.current = undefined;
    },
    [installationId]
  );

  const onRouteChange = useCallback(
    (reported: string) => {
      const route = canonicalPluginRoute(reported);
      if (route === null) {
        return;
      }
      lastRouteRef.current = route;
      if (addressTimerRef.current !== undefined) {
        return;
      }
      addressTimerRef.current = setTimeout(() => {
        addressTimerRef.current = undefined;
        void syncAddress(navigateRef.current, openBase, lastRouteRef.current);
      }, ADDRESS_SYNC_DELAY_MS);
    },
    [openBase]
  );

  const onCopyLink = useCallback(
    (named: string | undefined) => {
      const route = named === undefined ? lastRouteRef.current : canonicalPluginRoute(named);
      if (route === null) {
        throw new Error('The plugin route is invalid');
      }
      return copyLinkRef.current(`${window.location.origin}${appendRoute(openBase, route)}`);
    },
    [openBase]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['plugin-entry', projectId, installationId],
    queryFn: () => pluginsService.getEntryPoint(installationId),
    enabled: Boolean(projectId) && installationId.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const openExternal = useCallback((url: string) => {
    // The sandbox denies the plugin both navigation and popups, so it asks and the host
    // decides. Anything but https is not a link worth opening on its behalf.
    if (url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const navigateInApp = useCallback((path: string) => {
    // The leading slash is the only shape check worth making: a relative path resolves
    // against this origin and would pass the comparison below. Everything that reaches
    // for another host -- "//evil.example/x", "/\evil.example/x" -- resolves to that
    // host and is caught by comparing origins, so no second shape check earns its place.
    if (!path.startsWith('/')) {
      return;
    }

    let target: URL;
    try {
      target = new URL(path, window.location.origin);
    } catch {
      return;
    }

    if (target.origin !== window.location.origin) {
      return;
    }

    void navigateRef.current(`${target.pathname}${target.search}${target.hash}`);
  }, []);

  // One plugin's failed handshake says nothing about the next one, and this component
  // survives the switch between two installations.
  useEffect(() => {
    setBroken(false);
  }, [installationId]);

  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe || !data || !projectId || !userId) {
      return;
    }

    const bridge = createPluginHostBridge({
      iframe,
      // Assigned by the bridge once it is listening, never by the markup: React commits
      // src before effects run, so a fast plugin's single announcement would be lost.
      src: data.deliveryUrl,
      apiOrigin: window.location.origin,
      context: {
        pluginId: data.pluginId,
        installationId,
        projectId,
        userId,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        credentialHandles: data.credentialHandles,
        // A rebuilt bridge resumes where the address bar already points.
        route: lastRouteRef.current,
      },
      fetchRuntimeToken: fetchRuntimeToken(installationId),
      onOpenExternal: openExternal,
      onNavigate: navigateInApp,
      onRouteChange,
      onCopyLink,
      onBroken: () => {
        setBroken(true);
      },
    });

    return () => {
      bridge.dispose();
    };
    // `broken` is a dependency because it unmounts the frame: without it, clearing the
    // flag for the next installation would leave the remounted frame with no bridge.
  }, [
    data,
    projectId,
    installationId,
    userId,
    openExternal,
    navigateInApp,
    onRouteChange,
    onCopyLink,
    broken,
  ]);

  if (isLoading) {
    return <PluginPageMessage title='Loading…' />;
  }

  if (error || !data) {
    return (
      <PluginPageMessage
        title={isSuspended(error) ? 'Temporarily unavailable' : 'This plugin could not be opened'}
        description={
          isSuspended(error)
            ? 'An administrator has suspended this plugin across the whole deployment. Your installation is untouched and will work again once it is resumed.'
            : 'It may have been removed, or you may no longer have access to it.'
        }
        backHref={scope('/plugins')}
      />
    );
  }

  // Unmounting the frame is the point: the channel is already closed, so leaving it
  // painted shows a plugin that answers nothing and reads as merely slow.
  if (broken) {
    return (
      <PluginPageMessage
        title='This plugin could not be opened'
        description='It did not complete the handshake with OWOX. Reload the page to try again, and tell the publisher if it keeps happening.'
        backHref={scope('/plugins')}
      />
    );
  }

  return (
    <>
      <iframe
        ref={frameRef}
        sandbox={SANDBOX}
        allow=''
        referrerPolicy='no-referrer'
        title={data.displayName}
        className='h-full w-full border-0'
      />
      {fallbackDialog}
    </>
  );
}

async function syncAddress(navigate: NavigateFunction, openBase: string, route: string) {
  const { pathname } = window.location;
  if (pathname !== openBase && !pathname.startsWith(`${openBase}/`)) {
    return;
  }
  if (routeFromLocation(window.location, openBase) === route) {
    return;
  }
  try {
    await navigate(appendRoute(openBase, route), { replace: true });
  } catch {
    // Safari throws a SecurityError past its history rate limit; the next report retries.
  }
}

/**
 * Suspension is a distinct state, not a generic failure: the member's installation is
 * intact and will work again, which is worth saying rather than implying it is broken.
 */
function isSuspended(error: unknown): boolean {
  return (
    (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code ===
    'PLUGIN_SUSPENDED'
  );
}
