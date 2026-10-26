import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import type { CredentialConsumerType } from '../credential.types';

/** The titles of the given consumers that the member can see, by consumer id. */
export type CredentialConsumerTitleLookup = (
  context: AuthorizationContext,
  consumerIds: readonly string[]
) => Promise<ReadonlyMap<string, string>>;

/** Visible consumer titles by consumer type, then consumer id. */
export type CredentialConsumerTitles = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** Each consumer's module registers its title lookup here, so data-marts imports none of them. */
@Injectable()
export class CredentialConsumerTitlesService {
  private readonly lookups = new Map<string, CredentialConsumerTitleLookup>();

  register(consumerType: CredentialConsumerType, lookup: CredentialConsumerTitleLookup): void {
    this.lookups.set(consumerType, lookup);
  }

  /** One lookup per consumer type; a type nobody registered stays untitled. */
  async visibleTitles(
    context: AuthorizationContext,
    consumers: readonly { readonly consumerType: string; readonly consumerId: string }[]
  ): Promise<CredentialConsumerTitles> {
    const idsByType = new Map<string, Set<string>>();
    for (const { consumerType, consumerId } of consumers) {
      idsByType.set(consumerType, (idsByType.get(consumerType) ?? new Set()).add(consumerId));
    }
    const titles = new Map<string, ReadonlyMap<string, string>>();
    for (const [consumerType, ids] of idsByType) {
      const lookup = this.lookups.get(consumerType);
      if (lookup) titles.set(consumerType, await lookup(context, [...ids]));
    }
    return titles;
  }
}
