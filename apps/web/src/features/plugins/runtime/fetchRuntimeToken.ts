import { pluginsService } from '../services/plugins.service';
import type { FetchRuntimeToken } from './pluginHostBridge';

/**
 * Mints a runtime token for one installation.
 *
 * The endpoint behind this belongs to the delegated runtime authorization track. Until
 * it exists, calling this fails and the plugin cannot open -- which is the correct
 * behaviour, not a gap to paper over.
 *
 * There is deliberately no fallback to the member's own token. A member token carries no
 * `authFlow: 'plugin'`, so the backend guard cannot recognise plugin traffic, the
 * deny-list never fires, and a plugin could ask the host to mint itself a permanent API
 * key. A plugin that cannot open is a far better failure than one running with
 * unrecognised authority.
 */
export const fetchRuntimeToken =
  (installationId: string): FetchRuntimeToken =>
  () =>
    pluginsService.getRuntimeToken(installationId);
