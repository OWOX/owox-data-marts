/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Renders a run's terminal failure into the message envelope the host parses.
 *
 * This is the only place `error.isWarning` is acted on: every classification a
 * source makes — an expired credential, a revoked ad account, a deleted
 * advertiser — travels on that flag and is decided here, so it lives in Core
 * where it can be tested rather than inline in the runner script.
 */
export class RunFailureReport {
  /**
   * @param {unknown} error - whatever reached the top-level catch
   * @returns {{type: string, at: string, warning?: string, error?: string}}
   */
  static toEnvelope(error) {
    const isWarning = error?.isWarning === true;
    // A warning is customer-facing and fully described by its message: it names
    // a condition the customer acts on (a revoked account, an expired token),
    // not a defect anyone would debug from a stack. Failure emails show only the
    // first 300 characters of this field, so a stack would push the readable
    // part out of view for no diagnostic gain.
    //
    // NOTE: this deliberately does NOT rely on the stack being recorded
    // elsewhere. An earlier version of this comment claimed AbstractConnector
    // logs the stack as its own entry before rethrowing; it does not -- it
    // emits `error.message` only, and for a flagged error it now emits nothing
    // at all (see AbstractConnector.run, which stopped double-reporting flagged
    // failures at ERROR severity). So for a warning the stack is genuinely
    // dropped, which is the intended trade: readable over diagnosable, chosen
    // because a flagged error is by definition one whose cause is already
    // stated in its message.
    const detail = isWarning ? (error?.message ?? String(error)) : (error?.stack ?? String(error));

    return {
      type: isWarning ? 'addWarningToCurrentStatus' : 'error',
      at: new Date().toISOString(),
      [isWarning ? 'warning' : 'error']: detail,
    };
  }
}
