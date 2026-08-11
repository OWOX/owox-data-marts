/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/AbstractConnector.js
import { ControlEvent } from './Events/ControlEvent.js';
import { StateEvent } from './Events/StateEvent.js';
import {
  RUN_CONFIG_TYPE,
  CONTROL_ACTION,
  DATE_STRATEGY,
  LOG_LEVEL,
} from '../Constants/CommonConstants.js';

export class AbstractConnector {
  constructor(context, source, StorageClass) {
    if (!context) throw new Error('context is required');
    if (!source) throw new Error('source is required');
    if (!StorageClass) throw new Error('StorageClass is required');

    this.context = context;
    this.source = source;
    this.StorageClass = StorageClass;
  }

  /**
   * Creates a Storage instance for a specific node (each node = own table/schema).
   *
   * NOTE: Storage instances are not explicitly disposed. Subclasses must manage
   * their own resources (e.g. release connections after init/saveData). A
   * future refactor could introduce an optional `dispose()` hook called after
   * each node's processing completes.
   */
  getStorageForNode(nodeName, nodeSchema) {
    const destinationName = this._wireDestinationName(nodeName, nodeSchema);
    return new this.StorageClass(
      this.context,
      nodeSchema.uniqueKeys || [],
      nodeSchema.fields || [],
      destinationName
    );
  }

  /**
   * Points the context's DestinationTableName parameter at a node.
   *
   * Storages read the destination table from that parameter (default "Data"),
   * so it has to hold the resolved per-node name before the storage is
   * constructed. It is ALSO read during fetchData -- DeclarativeSource tags its
   * `rows_extracted` analytics with it -- which is why this is separable from
   * storage construction: the day-by-day loop interleaves several nodes against
   * one context, so whichever node is about to fetch must re-claim it first.
   *
   * @param {string} nodeName
   * @param {object} nodeSchema
   * @returns {string} the resolved destination name
   * @private
   */
  _wireDestinationName(nodeName, nodeSchema) {
    const destinationName = this.source.getDestinationName(nodeName, nodeSchema);
    this.context.storageConfig.DestinationTableName = { value: destinationName };
    return destinationName;
  }

  /**
   * Main entry point. Orchestrates the full import process.
   *
   * Loop nesting (restored from main, see main's FacebookMarketing/Connector.js
   * `startImportProcessOfTimeSeriesData`): non-time-series nodes run first, node
   * by node with the accounts inside; time-series nodes then run
   * DAY (outer) -> ACCOUNT -> NODE (inner). The nesting is load-bearing, not
   * cosmetic: the incremental checkpoint is emitted from the day loop, so a day
   * can only be checkpointed once EVERY account has finished it. Nesting the
   * accounts outside the days (which this engine used to do) let account 1
   * stream StateEvent all the way to today before account 2 was attempted at
   * all -- the backend persists those immediately, so account 2's failure on its
   * first day silently dropped the rest of its window: the run had already moved
   * the cursor past days that were never requested for it.
   *
   * Error isolation is deliberately narrow, as main's was: an account-scoped
   * permission failure (`isWarning`) is recorded and skipped for that pass and
   * the remaining accounts still import; ANY other error ends the run where it
   * happened, so later accounts are never attempted. See _recordAccountFailure.
   * The run also fails at the end when every account was skipped (see
   * _reportAccountOutcomes) -- a total skip means nothing was imported at all.
   *
   * Hooks invoked: parseFields, getAccounts, getDateStrategy, getDestinationName,
   * fetchData, onAccountComplete, onAccountError, onImportComplete.
   *
   * Events emitted: ControlEvent (started, completed|failed), StateEvent (per
   * completed day/window, INCREMENTAL runs only -- see _advanceCursor).
   */
  async run() {
    this.context.emit(new ControlEvent(CONTROL_ACTION.STARTED));

    try {
      this.context.validate();
      this._processRunConfig();

      if (!this.source.fieldsSchema || typeof this.source.fieldsSchema !== 'object') {
        throw new Error(
          `Source ${this.source.constructor?.name || 'unknown'} must declare fieldsSchema`
        );
      }

      const selectedFields = this.source.parseFields(this.context);
      const accounts = this._resolveAccounts();
      const state = this._createRunState(accounts);
      const { plainNodes, timeSeriesNodes } = this._planNodes(selectedFields);

      // Non-time-series nodes first, exactly as main's FacebookMarketing and
      // TikTokAds ordered them: catalog snapshots are cheap and their failure
      // should surface before a multi-day window is spent on it.
      for (const node of plainNodes) {
        if (node.schema.isFullRefresh) {
          await this.processFullRefreshNode(node.name, node.fields, node.schema, accounts, state);
        } else {
          await this.processCatalogNode(node.name, node.fields, node.schema, accounts, state);
        }
      }

      await this._processTimeSeriesNodes(timeSeriesNodes, accounts, state);

      for (const account of accounts) {
        if (!state.issues.has(this._accountKey(account))) {
          this.source.onAccountComplete(account);
        }
      }

      this._reportAccountOutcomes(state);

      this.source.onImportComplete(this.context);
      this.context.emit(new ControlEvent(CONTROL_ACTION.COMPLETED));
    } catch (error) {
      // A CONTROL `failed` event is translated host-side into an ERROR-severity
      // message: logged at error level and pushed into liveErrors. The rethrow
      // below reaches connector-runner's top-level catch, which reports the SAME
      // error through RunFailureReport -- and that is the single place
      // `isWarning` is meant to be acted on, yielding a WARNING-severity message
      // for a flagged error.
      //
      // Emitting the CONTROL event unconditionally therefore reported every
      // flagged failure TWICE, at two different severities, with nothing
      // de-duplicating them. Since the ERROR copy arrived first, it paged
      // someone before the warning classification could take effect -- defeating
      // the entire purpose of `isWarning` ("this failed, but do not page
      // anyone"), including for _reportAccountOutcomes' own flagged
      // "all accounts were skipped" error a few lines above.
      //
      // Suppressing it for flagged errors does NOT weaken the run outcome: the
      // host files WARNING messages into the same configErrors list as ERROR
      // ones, so the run is still demoted to failed, and the terminal-status
      // fallback still does not fire. Only the paging severity changes, which
      // is exactly what the flag is for. An unflagged error is unchanged.
      if (error?.isWarning !== true) {
        this.context.emit(new ControlEvent(CONTROL_ACTION.FAILED, { error: error.message }));
      }
      throw error;
    }
  }

  /**
   * Splits the selected fields into the two orderings run() needs, warning once
   * per unknown node. Full-refresh and catalog nodes share an ordering (node
   * outer, accounts inner); time-series nodes are handed to
   * _processTimeSeriesNodes, which nests them under the day loop.
   *
   * @param {object} selectedFields nodeName -> field names, from source.parseFields
   * @returns {{plainNodes: object[], timeSeriesNodes: object[]}}
   * @private
   */
  _planNodes(selectedFields) {
    const plainNodes = [];
    const timeSeriesNodes = [];

    for (const [name, fields] of Object.entries(selectedFields)) {
      const schema = this.source.fieldsSchema[name];
      if (!schema) {
        this.context.log(LOG_LEVEL.WARN, `Unknown node "${name}", skipping`);
        continue;
      }
      const node = { name, fields, schema };
      // isFullRefresh wins over isTimeSeries: a snapshot replacement has no
      // per-day semantics to preserve.
      if (!schema.isFullRefresh && schema.isTimeSeries) timeSeriesNodes.push(node);
      else plainNodes.push(node);
    }

    return { plainNodes, timeSeriesNodes };
  }

  /**
   * Per-run bookkeeping shared by every pass.
   *
   * `issues` is main's skippedAccounts Map: it keys the errors by account so a
   * partial failure is reported per account instead of collapsing into whichever
   * error happened to come last. Only SKIPPED accounts (an account-scoped
   * 401/403 -- permanent, reported as a warning) are ever recorded; any other
   * failure is rethrown by _recordAccountFailure and never reaches the Map.
   * `succeeded` and `cursorHalted` are what keep the incremental checkpoint
   * honest; see _advanceCursor.
   *
   * @param {Array} accounts every account this run was asked to import
   * @private
   */
  _createRunState(accounts) {
    return {
      attemptedCount: new Set(accounts.map(account => this._accountKey(account))).size,
      issues: new Map(),
      succeeded: new Set(),
      cursorHalted: false,
    };
  }

  /**
   * Resolves the accounts to iterate, telling "no account concept" apart from
   * "accounts exist but none resolved".
   *
   * `getAccounts(...) || [null]` conflated the two: `[]` is truthy, so the
   * fallback never fired for it. `AccountIDs = ","` parses to `[]` (see
   * AccountResolver, and every hand-written getAccounts -- they all
   * .filter(Boolean) the blanks away), the account loop body never ran, and the
   * run emitted ControlEvent(COMPLETED) having imported nothing.
   *
   * - null/undefined: the source has no account concept at all (the
   *   AbstractSource.getAccounts default). One pass with a null account.
   * - []: the source HAS accounts and resolved none of them. That is a
   *   configuration error, and there is no window of data it could still
   *   deliver, so it fails the run.
   *
   * @returns {Array} the accounts to iterate, never empty
   * @throws {Error} when the source resolved an empty account list
   * @private
   */
  _resolveAccounts() {
    const accounts = this.source.getAccounts(this.context);
    if (accounts === null || accounts === undefined) return [null];
    if (accounts.length > 0) return accounts;

    const error = new Error(
      'The account list resolved to zero accounts, so nothing would be imported. The account ' +
        'parameter (AccountIDs / CustomerId / AdAccountId, depending on the source) is set but ' +
        'holds no usable id -- a value such as "," or " ; " parses to an empty list. Fix that ' +
        'parameter and re-run.'
    );
    // Unlike the date errors raised inside the account loop (see
    // _requireParsedDate), flagging this one is safe AND correct: it is thrown
    // before the loop starts, so _recordAccountFailure can never see it and
    // mistake it for an account-scoped 401/403. It is customer-actionable, so
    // RunFailureReport keeps the readable message instead of a stack.
    error.isWarning = true;
    throw error;
  }

  /**
   * The identity a run counts an account by.
   *
   * Derived in one place because two call sites must agree: the key
   * _recordAccountFailure stores issues under, and the distinct attempted count
   * _reportAccountOutcomes compares that against. They used to disagree (Map
   * size vs raw array length), so `AccountIDs = "act_1, act_1"` with an expired
   * token gave two array entries but one Map entry -- the "everything was
   * skipped" check never fired and a run that imported nothing reported
   * success.
   *
   * @param {object|null} account
   * @returns {string} the account's identity
   * @private
   */
  _accountKey(account) {
    return account?.id ?? String(account);
  }

  /**
   * Runs one unit of work for one account, isolating its failure from the rest.
   *
   * @param {object} state run state from _createRunState
   * @param {object|null} account the account this unit belongs to
   * @param {Function} work async thunk performing the fetch + write
   * @returns {Promise<boolean>} true when the unit completed
   * @private
   */
  async _runForAccount(state, account, work) {
    try {
      await work();
      state.succeeded.add(this._accountKey(account));
      return true;
    } catch (error) {
      this.source.onAccountError(account, error);
      this.context.log(
        LOG_LEVEL.ERROR,
        `Error processing account ${account?.id}: ${error.message}`
      );
      this._recordAccountFailure(state, account, error);
      return false;
    }
  }

  /**
   * Decides whether a failed account lets the import move on to the next one.
   *
   * Port of main's FacebookMarketing `_skipOrRethrow`, and deliberately as
   * narrow as that one was -- exactly two outcomes, with `isWarning` the only
   * thing that separates them:
   *
   * - SKIPPED (`isWarning`, set by AbstractSource for 401/403): this token
   *   cannot reach this account and no amount of retrying changes that, so
   *   continuing costs nothing. The cursor still advances. Holding it back for a
   *   permanently revoked account would make every later run re-import an
   *   ever-growing window until it times out, turning one account's gap into
   *   total data loss -- which is why main advanced past skipped accounts too
   *   (FacebookMarketing #1519). The gap is surfaced by _reportAccountOutcomes.
   * - EVERYTHING ELSE (a storage write, an exhausted transient error, a bad
   *   manifest, a 404): rethrown on the spot, so the accounts after this one are
   *   never attempted. None of those are account-scoped -- the next account is
   *   just as likely to hit the same condition -- so spending the rest of the
   *   window rediscovering it one account at a time buys nothing and only delays
   *   the failure the customer has to act on.
   *
   * There is no account-count special case: a one-account run whose only account
   * is skipped falls through to the "nothing was imported" check in
   * _reportAccountOutcomes, exactly as main's _throwIfAllAccountsSkipped did.
   *
   * `isWarning` is compared strictly (main used a truthy check). A stale or
   * hand-set non-boolean must not buy an account a skip; RunFailureReport reads
   * the flag the same way.
   *
   * @param {object} state run state from _createRunState
   * @param {object|null} account the account that failed
   * @param {Error} error the failure to classify
   * @throws {Error} the original error, when it is not an account-scoped permission failure
   * @private
   */
  _recordAccountFailure(state, account, error) {
    if (error?.isWarning !== true) {
      throw error;
    }

    const accountId = this._accountKey(account);
    let entry = state.issues.get(accountId);
    if (!entry) {
      entry = { errors: [] };
      state.issues.set(accountId, entry);
    }
    entry.errors.push(error);

    this.context.log(LOG_LEVEL.WARN, `Skipped account ${accountId}: ${error.message}`);
  }

  /**
   * Persists the incremental checkpoint for a completed day or window.
   *
   * The cursor is a high-water mark over a CONTIGUOUS completed prefix, so once
   * a day is withheld every later day is withheld too -- emitting day N+1 after
   * skipping day N would strand day N exactly as if it had been checkpointed.
   * `cursorHalted` is therefore sticky for the whole run and is also honoured by
   * later nodes, which share the one LastRequestedDate.
   *
   * Only INCREMENTAL runs checkpoint at all (matches main: a MANUAL_BACKFILL
   * must never clobber the live incremental cursor).
   *
   * @param {object} state run state from _createRunState
   * @param {number} completedBy how many accounts finished the pass
   * @param {string} date the day (or window end) just completed
   * @private
   */
  _advanceCursor(state, completedBy, date) {
    // Nothing at all was written for this pass, so moving past it would lose it
    // outright. main guarded exactly this with _throwIfAllAccountsSkipped(),
    // called immediately before updateLastRequstedDate().
    if (completedBy === 0) state.cursorHalted = true;

    this._emitCursor(state, date);
  }

  /**
   * Emits the checkpoint itself, once its caller has decided the date is safe.
   *
   * Split out of _advanceCursor because a RANGE node's window is claimed by
   * _processTimeSeriesNodes at the END of the run rather than by the pass that
   * completed it, and by then there is no "how many accounts finished this
   * pass" left to weigh -- only the sticky halt flag.
   *
   * @param {object} state run state from _createRunState
   * @param {string} date the day (or window end) being claimed
   * @private
   */
  _emitCursor(state, date) {
    if (state.cursorHalted) return;
    if (this.context.runConfig && this.context.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.context.emit(new StateEvent({ lastRequestedDate: date }));
    }
  }

  /**
   * Reports how the accounts fared, once every account has been attempted.
   *
   * Only skipped accounts reach this point: _recordAccountFailure rethrows
   * anything else, so a run that gets here failed no account outright. Two
   * outcomes, checked in this order (the port of main's
   * _throwIfAllAccountsSkipped, plus its caller's trailing warning):
   *
   * - no account imported anything: every account failing at once is not a set
   *   of individual accounts losing access on the same day, it points to a
   *   global cause such as an expired access token. Reporting success there
   *   would hide a total outage behind a run that imported nothing.
   * - some accounts skipped, others imported: completes, but as a warning --
   *   otherwise the only trace would be a log line and the run would report
   *   plain success while that account's data is missing.
   *
   * Attempted accounts are counted DISTINCT (see _accountKey). Comparing
   * against the raw array length let a repeated id -- `AccountIDs = "act_1,
   * act_1"`, a copy-paste every multi-account source accepts -- make a
   * fully-failed run look partial.
   *
   * @param {object} state run state from _createRunState
   * @throws {Error} when nothing was imported at all
   * @private
   */
  _reportAccountOutcomes(state) {
    if (state.issues.size === 0) return;

    const describe = entries =>
      entries
        .map(([accountId, entry]) => {
          const last = entry.errors[entry.errors.length - 1];
          return `${accountId}: ${last ? last.message : 'unknown error'}`;
        })
        .join('; ');

    if (state.succeeded.size === 0) {
      const error = new Error(
        `All ${state.attemptedCount} accounts were skipped, so nothing was imported. This points ` +
          `to a global failure, such as an expired access token, rather than individual accounts ` +
          `being inaccessible. Errors: ${describe([...state.issues.entries()])}`
      );
      // Every skipped account was skipped because of a permission failure, which
      // is something the customer can act on: RunFailureReport keeps the readable
      // message instead of a stack for a flagged error.
      error.isWarning = true;
      throw error;
    }

    this.context.log(
      LOG_LEVEL.WARN,
      `${state.issues.size} out of ${state.attemptedCount} accounts were skipped and their data ` +
        `is missing. Skipped accounts: ${[...state.issues.keys()].join(', ')}`
    );
  }

  // --- node passes ---

  /**
   * Lazily builds (and memoizes) the storage for a node, re-claiming
   * DestinationTableName each time so an interleaved node cannot leave it
   * pointing elsewhere. One storage per node matches main, which memoized them
   * in `this.storages[nodeName]`.
   *
   * storage.init() is NOT called here: that is what actually creates the
   * destination table (BigQuery/Redshift/...), so it stays deferred until a
   * write is actually wanted (matches main, where `data.length ||
   * CreateEmptyTables` gated the whole write, table creation included).
   *
   * @private
   */
  _nodeWriter(writers, node) {
    let writer = writers.get(node.name);
    if (!writer) {
      writer = { storage: this.getStorageForNode(node.name, node.schema), initialized: false };
      writers.set(node.name, writer);
    } else {
      this._wireDestinationName(node.name, node.schema);
    }
    return writer;
  }

  /**
   * Writes one batch through a node's storage, gated on data presence /
   * CreateEmptyTables.
   *
   * saveData is called unconditionally WITHIN the gate (even with 0 rows) so
   * that storages which defer table creation into saveData() itself --
   * AwsRedshiftStorage / AwsAthenaStorage, see their saveData() empty-batch
   * branches -- get a chance to create the table. init() alone does not create
   * the table for those two.
   *
   * @private
   */
  async _writeBatch(writer, data, fields) {
    const createEmptyTables = this.context.getParameter('CreateEmptyTables')?.value;
    if (!((data && data.length > 0) || createEmptyTables)) return;
    if (!writer.initialized) {
      await writer.storage.init();
      writer.initialized = true;
    }
    await writer.storage.saveData(this._addMissingFields(data || [], fields));
  }

  /**
   * Normalizes the `accounts` argument of the public process*Node methods so
   * they stay callable with a single account (as GoogleSheets' unit test does).
   * @private
   */
  _asAccountList(accounts) {
    return Array.isArray(accounts) ? accounts : [accounts];
  }

  async processCatalogNode(nodeName, fields, schema, accounts, state) {
    const accountList = this._asAccountList(accounts);
    const runState = state || this._createRunState(accountList);
    const writers = new Map();
    const node = { name: nodeName, fields, schema };

    for (const account of accountList) {
      await this._runForAccount(runState, account, async () => {
        const writer = this._nodeWriter(writers, node);
        const data = await this.source.fetchData({
          nodeName,
          fields,
          accountId: account?.id ?? null,
          startDate: null,
          endDate: null,
        });
        await this._writeBatch(writer, data, fields);
      });
    }
    // Catalog nodes are full snapshots; no incremental state to persist.
  }

  /**
   * Time-series nodes, grouped by the date strategy their source declares.
   *
   * The day-by-day nodes are processed together under ONE day loop rather than
   * one loop each. With a loop per node, node A could finish every day for
   * every account and checkpoint the cursor at today before node B was started
   * -- reintroducing, one level down, the very race the account nesting used to
   * cause. main nested the nodes innermost for the same reason.
   *
   * The RANGE nodes, which run first, are held to the same rule: they do NOT
   * checkpoint their own window. The invariant is that the persisted cursor
   * never exceeds the last day EVERY time-series node in the run completed, and
   * a range node emitting its window end (today, for an INCREMENTAL run) before
   * the day loop had even started broke it -- the backend persists a StateEvent
   * immediately and unconditionally, so a day-by-day sibling that then failed
   * for every account could not take it back. `state.cursorHalted` only
   * suppresses LATER emissions; it cannot retract a persisted one.
   *
   * @private
   */
  async _processTimeSeriesNodes(nodes, accounts, state) {
    if (!nodes.length) return;

    const dayByDayNodes = [];
    const windowEndDates = [];
    for (const node of nodes) {
      const strategy = this.source.getDateStrategy(node.name);
      if (strategy === DATE_STRATEGY.RANGE) {
        const completedThrough = await this._processWindowNode(node, accounts, state);
        if (completedThrough) windowEndDates.push(completedThrough);
      } else if (strategy === DATE_STRATEGY.NONE) {
        await this._processUndatedNode(node, accounts, state);
      } else {
        dayByDayNodes.push(node);
      }
    }

    await this._processDayByDayNodes(dayByDayNodes, accounts, state);

    // A completed range node covers every day of the window at once, so when a
    // day-by-day node also ran, its per-day checkpoints already say everything
    // the range nodes could -- and they are the ones that have to gate the
    // cursor, being the slower pass. Their per-day emission is deliberately
    // kept rather than collapsed into one at the end: it is what makes a long
    // run resumable if the pod dies midway.
    //
    // Only a run with range nodes and NO day-by-day node has nothing left to
    // emit, and an incremental connector built that way would never progress.
    // It claims the window here instead, at the EARLIEST end date any range
    // node reached, and only if no pass has halted the cursor.
    if (dayByDayNodes.length || !windowEndDates.length) return;
    this._emitCursor(
      state,
      windowEndDates.reduce((earliest, date) => (date < earliest ? date : earliest))
    );
  }

  /**
   * DATE_STRATEGY.RANGE: one request per account covering the whole window.
   *
   * A range node either completes the window or it does not, so it reports the
   * window end back to _processTimeSeriesNodes rather than checkpointing it
   * itself -- see the note there on why claiming it inline lost a sibling
   * node's whole window.
   *
   * @returns {Promise<string|null>} the window end this node completed, or null
   *   when no account completed it (or the node had no window at all)
   * @private
   */
  async _processWindowNode(node, accounts, state) {
    const dateRange = this.getDateRange();
    if (!dateRange) {
      this.context.log(LOG_LEVEL.WARN, `Could not determine date range for node "${node.name}"`);
      return null;
    }

    const writers = new Map();
    let completedBy = 0;

    for (const account of accounts) {
      const done = await this._runForAccount(state, account, async () => {
        const writer = this._nodeWriter(writers, node);
        const data = await this.source.fetchData({
          nodeName: node.name,
          fields: node.fields,
          accountId: account?.id ?? null,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
        await this._writeBatch(writer, data, node.fields);
      });
      if (done) completedBy += 1;
    }

    // The same guard _advanceCursor applies to a day: a pass no account
    // completed is a pass whose data moving past it would lose, and the halt is
    // sticky for the rest of the run.
    if (completedBy === 0) {
      state.cursorHalted = true;
      return null;
    }
    return dateRange.endDate;
  }

  /**
   * DATE_STRATEGY.NONE: the node carries no date window at all, so there is
   * exactly ONE request to make per account.
   *
   * This used to fall through to the day-by-day loop, which asked for the same
   * dateless request once per day of the window -- DeclarativeSource returns
   * NONE whenever a manifest node omits `incremental.strategy`, and
   * _withDateWindow returns the spec unchanged for NONE, so nothing whatsoever
   * differed between those requests. A builder-authored manifest with
   * `isTimeSeries: true` and no `incremental` block therefore issued 45-75
   * identical requests on its first run and wrote that many duplicate batches.
   *
   * No checkpoint is emitted: a node that never reads the cursor must not move
   * it, and moving it here would also defeat a sibling day-by-day node that is
   * deliberately holding it back.
   *
   * @private
   */
  async _processUndatedNode(node, accounts, state) {
    await this.processCatalogNode(node.name, node.fields, node.schema, accounts, state);
  }

  /**
   * DATE_STRATEGY.DAY_BY_DAY (the default), nested exactly as main did it:
   * day (outer) -> account -> node (inner), with the checkpoint emitted at the
   * bottom of the day loop.
   * @private
   */
  async _processDayByDayNodes(nodes, accounts, state) {
    if (!nodes.length) return;

    const dateRange = this.getDateRange();
    if (!dateRange) {
      this.context.log(
        LOG_LEVEL.WARN,
        `Could not determine date range for node "${nodes[0].name}"`
      );
      return;
    }

    const writers = new Map();

    for (const date of this._iterateDates(dateRange.startDate, dateRange.endDate)) {
      const formattedDate = this._formatDate(date);
      let completedBy = 0;

      for (const account of accounts) {
        // One try/catch around the whole node loop, as main had it: a SKIPPED
        // account loses node 3 for this day only -- the other accounts, and this
        // account's other days, are unaffected. Any other failure leaves through
        // _recordAccountFailure and ends the run.
        const done = await this._runForAccount(state, account, async () => {
          for (const node of nodes) {
            const writer = this._nodeWriter(writers, node);
            const data = await this.source.fetchData({
              nodeName: node.name,
              fields: node.fields,
              accountId: account?.id ?? null,
              startDate: formattedDate,
              endDate: formattedDate,
            });
            await this._writeBatch(writer, data, node.fields);
          }
        });
        if (done) completedBy += 1;
      }

      this._advanceCursor(state, completedBy, formattedDate);
    }
  }

  /**
   * Kept for callers that drive a single time-series node directly; run() goes
   * through _processTimeSeriesNodes so that every day-by-day node shares one
   * day loop.
   */
  async processTimeSeriesNode(nodeName, fields, schema, accounts, state) {
    const accountList = this._asAccountList(accounts);
    await this._processTimeSeriesNodes(
      [{ name: nodeName, fields, schema }],
      accountList,
      state || this._createRunState(accountList)
    );
  }

  /**
   * Full-refresh node: the source's snapshot replaces the destination table
   * outright, so a row or column that disappeared upstream also disappears
   * downstream. A catalog node cannot express this — its MERGE only ever adds
   * and updates, never removes.
   *
   * The snapshot is accumulated across ALL accounts and written ONCE. Calling
   * replaceData per account made every account truncate and rewrite the table,
   * so with an `accounts` block only the last account's rows survived.
   *
   * Fields come from the fetched data rather than from configuration, because
   * a full-refresh source is one whose schema lives in the data (a
   * spreadsheet's header row). The discovered list is written back into the
   * context so storage sees it via getSelectedFields(), and emitted so the
   * host's stored selection stops drifting from the real table.
   *
   * @param {string} nodeName
   * @param {string[]} nodeFields - fields selected in config, if any
   * @param {object} schema - the node's fieldsSchema entry
   * @param {Array|object|null} accounts - accounts to snapshot (or a single one)
   * @param {object} [state] - run state from _createRunState
   */
  async processFullRefreshNode(nodeName, nodeFields, schema, accounts, state) {
    const accountList = this._asAccountList(accounts);
    const runState = state || this._createRunState(accountList);
    // Collected per account and flattened once. `rows.push(...data)` would pass
    // every row as a separate argument and blow the engine's argument limit
    // (RangeError) on a large snapshot -- and a full-refresh source is exactly
    // the kind that returns one: Google Sheets hands back a whole sheet. The
    // single-account case, which is every full-refresh source today, keeps the
    // fetched array as-is instead of copying it.
    const batches = [];
    // Accounts that contributed no batch because they were skipped, keyed the
    // same way _reportAccountOutcomes counts them so a repeated id cannot make
    // one missing account look like two.
    const missing = new Set();

    for (const account of accountList) {
      const done = await this._runForAccount(runState, account, async () => {
        const data = await this.source.fetchData({
          nodeName,
          fields: nodeFields,
          accountId: account?.id ?? null,
          startDate: null,
          endDate: null,
        });
        if (data && data.length) batches.push(data);
      });
      if (!done) missing.add(this._accountKey(account));
    }

    // A partial snapshot cannot express "replace". The write below truncates
    // and swaps the whole destination table (GoogleBigQueryStorage.replaceData
    // stages then publishes over the live table, with no empty-snapshot guard
    // of its own), so publishing without a skipped account's rows DELETES what
    // that account imported on earlier runs -- and no later run can put them
    // back, because the next snapshot is built from upstream, not from the
    // table. With every account skipped the snapshot is empty, and
    // CreateEmptyTables defaults to TRUE for declarative manifests, so the
    // rows.length guard below does not catch that case either: an expired token
    // replaced the live table with zero rows.
    //
    // _runForAccount swallows an `isWarning` failure so the OTHER accounts can
    // still import, which is right for an additive node and wrong for this one.
    // main had no such window at all: startImportProcess called fetchData()
    // with no try/catch, so any error aborted before the destructive write and
    // failed the run. Failing here keeps that parity -- merely skipping the
    // write would leave a run that imported nothing reporting COMPLETED.
    //
    // Flagging the error is safe for the same reason _resolveAccounts' is: it
    // is thrown outside _runForAccount, so _recordAccountFailure can never see
    // it and mistake it for an account-scoped 401/403.
    if (missing.size) {
      const error = new Error(
        `Node "${nodeName}" replaces its whole destination table on every run, but ` +
          `${missing.size} of ${runState.attemptedCount} accounts could not be read, so this ` +
          `snapshot is missing their rows. Publishing it would delete the data those accounts ` +
          `imported earlier, so the run is failed instead and the table is left untouched. ` +
          `Affected accounts: ${[...missing].join(', ')}`
      );
      error.isWarning = true;
      throw error;
    }

    const rows = batches.length === 1 ? batches[0] : batches.flat();

    // Re-read the schema: fetchData() is what discovers the real columns, so
    // the entry handed to us above can still be the placeholder.
    const discoveredSchema = this.source.fieldsSchema[nodeName] || schema;
    const fields = Object.keys(discoveredSchema.fields || {});

    if (fields.length) {
      const fieldsParam = this.context.getParameter('Fields');
      const value = fields.map(field => `${nodeName} ${field}`).join(', ');
      if (fieldsParam) {
        fieldsParam.value = value;
      } else {
        this.context.storageConfig.Fields = { value };
      }
      this.context.updateFields(fields);
    }

    this.context.log(
      LOG_LEVEL.INFO,
      rows.length
        ? `${rows.length} rows were fetched for node "${nodeName}"`
        : `No data rows were fetched for node "${nodeName}"`
    );

    // Publishing an EMPTY snapshot is how rows deleted upstream disappear
    // downstream, so it stays the default -- main's GoogleSheetsConnector called
    // replaceData(data) unconditionally and GoogleSheets/Source.js declares no
    // CreateEmptyTables parameter at all. An operator who explicitly turned
    // empty tables off is honoured, though; a truncate is the one write that
    // cannot be undone by the next run.
    const createEmptyTables = this.context.getParameter('CreateEmptyTables')?.value;
    if (rows.length === 0 && createEmptyTables === false) return;

    // Built after the field write-back: getStorageForNode() resolves the
    // destination and the storage reads the selected fields from the context.
    const storage = this.getStorageForNode(nodeName, discoveredSchema);
    await storage.replaceData(rows);
  }

  /**
   * Ensures every selected field is present as a key on each record, restoring
   * main's `addMissingFieldsToData` (see AbstractConnector.js on main,
   * `addMissingFieldsToData`, called from every bundled connector right before
   * `storage.saveData()`). Some APIs omit a field entirely from a given record;
   * without this, the field vanishes as a key instead of surfacing as an
   * explicit null -- which several bundled connectors' row-mapping helpers
   * (e.g. `if (field in record)` style lookups in LinkedInAds, MicrosoftAds'
   * Helper.filterByFields, TikTokAds' castFields) rely on to emit the column
   * at all.
   *
   * @param {object[]} data - fetched records
   * @param {string[]} selectedFields - field names selected for this node
   * @returns {object[]} the same array, with missing selected fields null-filled in place
   */
  _addMissingFields(data, selectedFields) {
    if (!data || !data.length || !selectedFields || !selectedFields.length) {
      return data;
    }
    for (const record of data) {
      for (const field of selectedFields) {
        if (!(field in record)) record[field] = null;
      }
    }
    return data;
  }

  // --- Date range logic (preserved from original AbstractConnector) ---

  getDateRange() {
    if (this.context.runConfig.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
      return this._getManualBackfillDateRange();
    }
    return this._getIncrementalDateRange();
  }

  _getManualBackfillDateRange() {
    const data = this.context.runConfig.data || [];
    let startDate = null;
    let endDate = null;

    for (const item of data) {
      if (item.configField === 'StartDate') startDate = item.value;
      if (item.configField === 'EndDate') endDate = item.value;
    }

    // main parity (AbstractConnector._getManualBackfillDateRange): a missing
    // StartDate must fail loudly. The redesigned engine returned null here,
    // which the caller (processTimeSeriesNode) treated as "nothing to do" --
    // logging a WARN and silently skipping the node, so the run still emitted
    // ControlEvent(COMPLETED) with 0 rows written instead of surfacing the
    // misconfiguration.
    if (!startDate) {
      throw new Error('StartDate is required for manual backfill');
    }
    if (!endDate) endDate = this._formatDate(new Date());

    // An unreadable date must fail here, loudly. POST /data-marts/:id/run
    // forwards runConfig.data values unchecked (its DTO only validates that
    // `data` is an object) and AbstractContext.validate() runs BEFORE
    // _processRunConfig() applies them, so a value of any shape reaches this
    // method. When _parseDate returned NaN for it, every comparison below was
    // false (NaN compares false against everything), so nothing was rejected --
    // and _iterateDates then ran `for (let t = NaN; t <= NaN; ...)`, i.e. zero
    // days. The run reported COMPLETED having fetched nothing.
    const startMs = this._requireParsedDate('StartDate', startDate);
    let endMs = this._requireParsedDate('EndDate', endDate);
    const today = this._formatDate(new Date());
    const todayMs = this._parseDate(today);

    // Validate that EndDate is not earlier than StartDate.
    if (endMs < startMs) {
      throw new Error(`EndDate (${endDate}) cannot be earlier than StartDate (${startDate})`);
    }

    // Validate that StartDate is not in the future.
    if (startMs > todayMs) {
      throw new Error(`StartDate (${startDate}) cannot be in the future`);
    }

    // EndDate in the future is clamped to today, not an error. Logged at INFO
    // (as main's config.logMessage did): the clamp is the DESIGNED handling --
    // the run request DTO was deliberately loosened to accept a future EndDate
    // precisely because the engine clamps it. At WARN the backend translates the
    // log into ConnectorMessageType.WARNING, pushes it into configErrors and
    // demotes the config to FAILED, so a complete, correct backfill would report
    // as a failed run.
    if (endMs > todayMs) {
      this.context.log(LOG_LEVEL.INFO, `EndDate (${endDate}) is in the future, adjusting to today`);
      endMs = todayMs;
    }

    // Normalize back to YYYY-MM-DD rather than echoing the accepted input: the
    // RANGE strategy hands these straight to source.fetchData(), which injects
    // them into the upstream request (DeclarativeSource._withDateWindow puts
    // them in the query string / request body), so an ISO-8601 timestamp the
    // engine tolerated must not reach the API verbatim.
    return {
      startDate: this._formatDate(new Date(startMs)),
      endDate: this._formatDate(new Date(endMs)),
    };
  }

  _getIncrementalDateRange() {
    const startDate = this._getIncrementalStartDate();
    const endDate = this._formatDate(new Date());
    return { startDate, endDate };
  }

  _getIncrementalStartDate() {
    const lastRequested = this.context.getParameter('LastRequestedDate');
    if (lastRequested && lastRequested.value) {
      return this._applyLookbackWindow(lastRequested.value);
    }
    // Default: 1st of previous month (UTC to avoid local-tz off-by-one)
    const now = new Date();
    const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return this._formatDate(firstOfLastMonth);
  }

  _applyLookbackWindow(dateStr) {
    const lookback = this.context.getParameter('ReimportLookbackWindow');
    const days = lookback ? Number(lookback.value) || 0 : 0;
    const dateMs = this._parseDate(dateStr);
    const adjusted = new Date(dateMs - days * 86400000);
    return this._formatDate(adjusted);
  }

  /**
   * Apply MANUAL_BACKFILL overrides to context parameters.
   * Side effect: mutates `param.value` on context parameters listed in runConfig.data.
   */
  _processRunConfig() {
    if (this.context.runConfig.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
      for (const item of this.context.runConfig.data || []) {
        const param = this.context.getParameter(item.configField);
        if (param) {
          param.value = item.value;
        }
      }
    }
  }

  /**
   * Yields every day in [startDate, endDate] as a UTC-midnight Date.
   *
   * The bounds are guarded rather than trusted: a NaN bound makes `t <= endMs`
   * false on the very first check, so the loop yields nothing at all and the
   * caller sees an empty range instead of an error -- the run then completes
   * having imported none of the requested days. Guarding here as well as in
   * _getManualBackfillDateRange keeps that impossible for every caller,
   * including the incremental path.
   */
  *_iterateDates(startDateStr, endDateStr) {
    const startMs = this._requireParsedDate('start date', startDateStr);
    const endMs = this._requireParsedDate('end date', endDateStr);
    for (let t = startMs; t <= endMs; t += 86400000) {
      yield new Date(t);
    }
  }

  /**
   * Parses a date, failing loudly when it cannot be read.
   *
   * The thrown error is deliberately NOT flagged `isWarning`. That flag is
   * overloaded: _recordAccountFailure reads it as "an account-scoped 401/403,
   * safe to skip and carry on with the other accounts". A misconfigured window
   * must fail the run instead of quietly skipping accounts -- which, with more
   * than one account, would land on the partial-skip path that completes the
   * run. (_resolveAccounts' error is flagged, and safely so, because it is
   * thrown before the account loop begins.)
   *
   * @param {string} label the field or bound the value came from
   * @param {*} value the configured value
   * @returns {number} milliseconds since epoch, at UTC midnight
   * @throws {Error} naming the field and the offending value
   * @private
   */
  _requireParsedDate(label, value) {
    const ms = this._parseDate(value);
    if (Number.isNaN(ms)) {
      throw new Error(
        `${label} (${String(value)}) is not a valid date. Use YYYY-MM-DD (e.g. 2024-01-15) or an ` +
          `ISO-8601 timestamp (e.g. 2024-01-15T00:00:00.000Z).`
      );
    }
    return ms;
  }

  /**
   * Parses a date value to UTC midnight (avoids DST/local-tz off-by-one).
   *
   * Accepts YYYY-MM-DD, an ISO-8601 timestamp, a Date and a numeric epoch;
   * anything else returns NaN for the caller to reject. main tolerated the
   * timestamp form because _processRunConfig coerced a `requiredType === 'date'`
   * value with `new Date(value)` before it got here; this engine dropped that
   * step, and the old `dateStr.split('-').map(Number)` read
   * '2024-01-15T00:00:00.000Z' as [2024, 1, NaN] -> NaN.
   *
   * Everything is pinned to UTC midnight, including a Date/epoch input: the
   * day-by-day loop steps in whole days from the start bound, so a bound at
   * 23:00 would drop the last day of the window off the end of the range.
   *
   * @param {string|Date|number} value
   * @returns {number} milliseconds since epoch, or NaN when unreadable
   */
  _parseDate(value) {
    if (value instanceof Date) {
      const ms = value.getTime();
      if (Number.isNaN(ms)) return NaN;
      return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return NaN;
      const asDate = new Date(value);
      return Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate());
    }

    if (typeof value !== 'string') return NaN;

    // The calendar date is read component-wise from the YYYY-MM-DD prefix and
    // any time part is ignored, for two reasons. It pins the value to UTC
    // midnight, so a local timezone cannot drift it by a day. And it takes the
    // date the customer wrote literally: shifting '2024-01-15T23:00:00-05:00'
    // into UTC would silently backfill the 16th instead of the 15th.
    //
    // 1-2 digit month/day components stay accepted because the old split('-')
    // accepted them and a stored config must not start failing. Out-of-range
    // components (e.g. '2024-13-45') keep rolling over via Date.UTC, which is
    // also what the old implementation did -- that is parity, not this fix's
    // business. A 1-3 digit year is NOT accepted: Date.UTC would map it into
    // 19xx, so such a config was requesting the wrong century's data already,
    // and failing loudly beats importing nothing.
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ].*)?$/.exec(value.trim());
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  _formatDate(date) {
    return date.toISOString().split('T')[0];
  }
}
