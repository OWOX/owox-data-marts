---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Plugins do their work on schedule, also when nobody has them open**

A plugin's backend action used to run only while a member had the plugin open, so a check meant
for every Monday at nine waited for someone to open it. Now a plugin can create schedules for its
installation with `ctx.schedules`, and OWOX Data Marts starts the action on its cron expression and
time zone with the installing member's access. The plugin's page lists its schedules, and members
pause, resume and delete them under **Plugins → Schedules**, which also lists their runs and lets
them cancel a queued or running one; a project admin sees the whole project there, and the plugin
cannot resume a schedule an admin paused.

The video adds a Google Doc to a weekly schedule of the example plugin Metric Watch, then opens
**Plugins → Schedules**, the schedule's run in **Run History**, and the check that run added to
the Doc:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/7739195f870a655a5e0e7da55f148ed2/iframe>

OWOX Data Marts disables a schedule, with the reason, when the action is no longer declared or the
parameters no longer match its schema, and skips its runs while the member is out of the project or
their account is locked.
A scheduled run that meets the installation's action limits waits, up to 24 hours, and starts once
they allow. In the SDK, `PluginActionStatus` now includes `QUEUED`, and an execution's `trigger`
can be `schedule`.
See [Run actions on a schedule](../../docs/plugins/authoring-guide.md#run-actions-on-a-schedule).
A self-managed deployment can change the schedule limits with five `PLUGIN_HOST_*` variables, such
as `PLUGIN_HOST_MAX_SCHEDULES_PER_INSTALLATION`; see
[Environment variables](../../docs/getting-started/deployment-guide/environment-variables.md#plugins).

In the SDK, `BackendActionContext.schedules`, `PluginActionExecution.scheduleId`,
`PluginActionExecutionContext.scheduleId` and `PluginContext.schedules` are new members: update
test doubles and exhaustive switches.
