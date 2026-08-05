import dns from 'node:dns';
import { Agent, type Dispatcher } from 'undici';
import { isPrivateIpv4, isPrivateIpv6 } from './safe-url.helper';

type LookupAddress = { address: string; family: number };
type LookupCallback = (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;

/**
 * Refuses a hostname that resolves anywhere private, at the moment the socket is opened.
 *
 * `assertPublicHttpUrl` resolves and vets the name, but it hands `fetch` the *name*, and
 * the transport then resolves it again on its own. A publisher serving their own DNS with
 * TTL 0 can answer the first lookup with a public address and the second -- the one that
 * decides where the socket goes -- with `169.254.169.254`. Validating inside the
 * transport's own lookup closes that window, because the address checked here is the
 * address connected to.
 */
export function guardedLookup(
  hostname: string,
  options: dns.LookupAllOptions,
  callback: LookupCallback
): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }

    const blocked = addresses.find(({ address, family }) =>
      family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)
    );

    if (blocked) {
      // Refuse the whole name rather than filter: if any answer points inside, the next
      // connection to the same name may well get that one.
      callback(
        Object.assign(new Error(`${hostname} resolves to a private address`), {
          code: 'EACCES',
        }),
        []
      );
      return;
    }

    callback(null, addresses);
  });
}

/**
 * Shared by every outbound request to a URL somebody else chose.
 *
 * One agent so connections pool normally; the guard lives in the lookup, so it applies to
 * every request the agent carries -- each redirect hop and the SDK descriptor probe
 * included -- without any caller having to remember it.
 */
export const guardedDispatcher: Dispatcher = new Agent({
  connect: { lookup: guardedLookup as never },
});

/** `dispatcher` is honoured by Node's fetch but absent from the DOM `RequestInit` type. */
export function withGuardedDispatcher(init: RequestInit): RequestInit {
  return { ...init, dispatcher: guardedDispatcher } as RequestInit;
}
