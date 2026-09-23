/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { DATE_STRATEGY } from '../../Constants/CommonConstants.js';

/**
 * The single definition of "is this manifest node fetched by date window?",
 * shared by ManifestParser (which decides whether to auto-register the
 * StartDate/EndDate manual-backfill parameters) and DeclarativeSource
 * (which compiles the flag AbstractConnector._planNodes dispatches on).
 *
 * These two answered the question separately once, and the copies disagreed:
 * the engine looked at `isTimeSeries` and the parser looked at `isTimeSeries`,
 * so a node that became time-series any other way got its date window but never
 * got the parameters that let a backfill supply one. Keeping the predicate here
 * means a change to what counts as time-series cannot land in one of them only.
 *
 * Every function here takes a RAW manifest node (`manifest.nodes[name]`), NOT a
 * compiled `fieldsSchema` entry.
 */

/**
 * The date strategy a node declares, normalized to a DATE_STRATEGY value.
 *
 * `||` rather than `??` so a blank strategy falls back to NONE exactly as the
 * run time always has (this backs DeclarativeSource.getDateStrategy).
 *
 * @param {object|undefined} node
 * @returns {string} one of DATE_STRATEGY
 */
export function nodeDateStrategy(node) {
  return node?.incremental?.strategy || DATE_STRATEGY.NONE;
}

/**
 * Whether the node asks to be fetched one date window at a time, i.e. carries
 * an `incremental` block with a strategy other than `none`.
 *
 * @param {object|undefined} node
 * @returns {boolean}
 */
export function declaresDateWindow(node) {
  return nodeDateStrategy(node) !== DATE_STRATEGY.NONE;
}

/**
 * Whether the node is processed as time-series — the flag
 * AbstractConnector._planNodes routes on.
 *
 * A node qualifies by saying so outright (`isTimeSeries: true`) OR by declaring
 * a real date strategy. The second half is inference, and it exists because
 * requiring both spellings was a grammar our own first-party callers failed
 * independently: the no-code builder emits `incremental` and never writes
 * `isTimeSeries` (apps/web's PaginationIncremental.test.tsx pins that), and the
 * canonical MCP manifest example (§19.4) declares `day-by-day` without the word
 * `isTimeSeries` anywhere in it. Declaring a date strategy IS declaring that the
 * node is fetched by date; making the author repeat it under a second name only
 * created a way to write a manifest that reads as incremental and silently is
 * not — the request goes out with no window, a `{{ dateWindow.start }}` field is
 * written empty, and uniqueKeys built on that date collapse the import onto one
 * row, all while the run reports success.
 *
 * An explicit `isTimeSeries: false` does NOT veto the inference. `false` is the
 * absence-equivalent default, while `incremental: { strategy: 'day-by-day' }` is
 * a positive statement of intent, so the positive one wins.
 *
 * `isFullRefresh` is deliberately not consulted here. It is the other case where
 * two positive declarations contradict, and there the engine has no basis for
 * picking a winner — replacing the table wholesale and walking it one day at a
 * time are opposite intents. ManifestParser refuses that pairing outright rather
 * than resolving it silently; see the check next to the strategy validation.
 *
 * @param {object|undefined} node
 * @returns {boolean}
 */
export function isTimeSeriesManifestNode(node) {
  if (!node || typeof node !== 'object') return false;
  return node.isTimeSeries === true || declaresDateWindow(node);
}
