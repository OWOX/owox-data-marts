/// <reference types="node" />
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createBackend as createFetchBackend } from './index.js';
import { isPublicAddress } from './private-address.js';
import { GUARDED_FETCH, PRIVATE_ADDRESS_CODE } from './requester.js';

export * from './index.js';

type LookupAddress = { address: string; family: number };
type LookupCallback = (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;

// Checked inside the connection's own lookup, so the address checked is the address connected
// to: a DNS answer that changes between lookups cannot reach a private address.
function guardedLookup(
  hostname: string,
  options: dns.LookupAllOptions,
  callback: LookupCallback
): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    // Refuse the whole name rather than filter: the next connection may get the private answer.
    if (addresses.some(({ address }) => !isPublicAddress(address))) {
      callback(
        Object.assign(new Error(`${hostname} resolves to a private address`), {
          code: PRIVATE_ADDRESS_CODE,
        }),
        []
      );
      return;
    }
    callback(null, addresses);
  });
}

const guardedAgent = new Agent({ connect: { lookup: guardedLookup as never } });

function guardedFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const guardedInit = { ...init, dispatcher: guardedAgent };
  return undiciFetch(input as URL, guardedInit as never) as unknown as Promise<Response>;
}

/**
 * `createBackend` for Node. Without `hosts`, every request to the calling host connects only to
 * public addresses.
 */
export function createBackend(
  options: Parameters<typeof createFetchBackend>[0]
): ReturnType<typeof createFetchBackend> {
  if (options.hosts) return createFetchBackend(options);
  // Elsewhere `undici` may be a shim that ignores the agent, as on Bun, so the lookup would not run.
  const versions = globalThis.process?.versions;
  if (typeof versions?.node !== 'string' || versions.bun !== undefined || 'Deno' in globalThis) {
    throw new TypeError(
      'createBackend: @owox/plugin-sdk/server/node checks addresses only on Node; list hosts on this runtime'
    );
  }
  return createFetchBackend({ ...options, [GUARDED_FETCH]: guardedFetch } as typeof options);
}
