// @vitest-environment happy-dom
import { render, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RequestStatus } from '../../shared/types/request-status';

import { IntercomChat } from './IntercomChat';

// Mocks
vi.mock('../store/hooks', () => {
  return {
    useFlags: vi.fn(),
  };
});

vi.mock('../../features/idp', () => {
  return {
    useAuth: vi.fn(),
  };
});

vi.mock('../api/apiClient', () => {
  return {
    default: {
      post: vi.fn(),
    },
  };
});

const { useFlags } = await import('../store/hooks');
const { useAuth } = await import('../../features/idp');
const apiClient = (await import('../api/apiClient')).default as unknown as {
  post: ReturnType<typeof vi.fn>;
};

function createScriptInDom() {
  const script = document.createElement('script');
  script.id = 'intercom-widget-script';
  document.head.appendChild(script);
  return script as HTMLScriptElement & { onload?: () => void };
}

describe('IntercomChat', () => {
  const intercomSpy = vi.fn();
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let restoreScriptSrc: (() => void) | null = null;

  // @ts-ignore
  beforeEach(() => {
    // reset DOM and mocks
    cleanup();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.clearAllMocks();

    window.Intercom = intercomSpy;

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const originalSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
      configurable: true,
      get() {
        return originalSrcDesc?.get?.call(this) ?? '';
      },
      set(value: string) {
        void value;
      },
    });
    restoreScriptSrc = () => {
      if (originalSrcDesc) {
        Object.defineProperty(HTMLScriptElement.prototype, 'src', originalSrcDesc);
      } else {
        // @ts-expect-error
        delete HTMLScriptElement.prototype.src;
      }
    };
  });

  afterEach(() => {
    warnSpy.mockRestore();
    restoreScriptSrc?.();
    restoreScriptSrc = null;
  });

  it('does nothing when flags are not loaded', () => {
    (useFlags as any).mockReturnValue({ flags: null, callState: RequestStatus.LOADING });
    (useAuth as any).mockReturnValue({ user: null });

    render(<IntercomChat />);

    // No script added and no Intercom call
    expect(document.getElementById('intercom-widget-script')).toBeNull();
    expect(intercomSpy).not.toHaveBeenCalled();
  });

  it('does nothing when INTERCOM_APP_ID flag is missing or empty', () => {
    (useFlags as any).mockReturnValue({ flags: {}, callState: RequestStatus.LOADED });
    (useAuth as any).mockReturnValue({ user: null });

    render(<IntercomChat />);

    expect(document.getElementById('intercom-widget-script')).toBeNull();
    expect(intercomSpy).not.toHaveBeenCalled();
  });

  it('injects script, fetches JWT, and boots Intercom with intercom_user_jwt', async () => {
    const appId = 'app_123';
    const user = { id: 'u1', email: 'a@b.c', fullName: 'John Doe', projectTitle: 'Proj' };

    (useFlags as any).mockReturnValue({
      flags: { INTERCOM_APP_ID: appId },
      callState: RequestStatus.LOADED,
    });
    (useAuth as any).mockReturnValue({ user });

    (apiClient.post as any).mockResolvedValue({ data: { token: 'jwt123' } });

    render(<IntercomChat />);

    // Script should be injected
    const script = document.getElementById('intercom-widget-script') as
      | (HTMLScriptElement & {
          onload?: () => void;
        })
      | null;
    expect(script).not.toBeNull();
    if (!script) throw new Error('intercom-widget-script not found');

    if (import.meta.env.MODE !== 'test') {
      expect(script.src).toContain(`https://widget.intercom.io/widget/${appId}`);
    }

    // Simulate script load
    if (typeof script.onload === 'function') {
      script.onload();
    }

    // Wait for async initializeIntercom to complete
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/intercom/jwt');
      // We may have additional Intercom('update', ...) calls; ensure a 'boot' call exists
      const bootCall = intercomSpy.mock.calls.find(call => call[0] === 'boot');
      expect(bootCall).toBeTruthy();
    });

    const bootCall = intercomSpy.mock.calls.find(call => call[0] === 'boot');
    if (!bootCall) throw new Error('Intercom boot call not found');
    const payload = bootCall[1];
    expect(payload).toMatchObject({
      app_id: appId,
      user_id: user.id,
      email: user.email,
      name: user.fullName,
      Name_project: user.projectTitle,
    });
    expect(payload.intercom_user_jwt).toEqual('jwt123');
  });

  it('does not inject a duplicate script and initializes immediately if script already exists', async () => {
    const appId = 'app_abc';
    const user = { id: 'u2' };
    (useFlags as any).mockReturnValue({
      flags: { INTERCOM_APP_ID: appId },
      callState: RequestStatus.LOADED,
    });
    (useAuth as any).mockReturnValue({ user });
    (apiClient.post as any).mockResolvedValue({ data: { token: 'tok' } });

    // Pre-create script to simulate already loaded
    const preScript = createScriptInDom();

    render(<IntercomChat />);

    // Should not create a new script element
    const allScripts = document.querySelectorAll('#intercom-widget-script');
    expect(allScripts.length).toBe(1);
    expect(allScripts[0]).toBe(preScript);

    // Because loadIntercomScript detects pre-existing, it should call onLoad synchronously.
    // initializeIntercom should run immediately.
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/intercom/jwt');
      expect(intercomSpy).toHaveBeenCalledWith('boot', expect.objectContaining({ app_id: appId }));
    });
  });

  it('does not boot Intercom and logs a warning when JWT fetch fails', async () => {
    const appId = 'app_err';
    const user = { id: 'u3' };
    (useFlags as any).mockReturnValue({
      flags: { INTERCOM_APP_ID: appId },
      callState: RequestStatus.LOADED,
    });
    (useAuth as any).mockReturnValue({ user });

    (apiClient.post as any).mockRejectedValue(new Error('network'));

    render(<IntercomChat />);

    const script = document.getElementById('intercom-widget-script') as
      | (HTMLScriptElement & {
          onload?: () => void;
        })
      | null;
    if (script && typeof script.onload === 'function') {
      script.onload();
    }

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/intercom/jwt');
    });

    const bootCall = intercomSpy.mock.calls.find(call => call[0] === 'boot');
    expect(bootCall).toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch Intercom JWT'),
      expect.anything()
    );
  });
});
