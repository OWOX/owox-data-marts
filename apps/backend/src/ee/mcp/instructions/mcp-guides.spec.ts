import { MCP_GUIDES, MCP_GUIDE_TOPICS } from './mcp-guides';
import { hasUniqueCountFieldCandidate } from '../tools/query-data-mart.input';

const UNIQUE_COUNT_EXAMPLE_FIELD = 'orders__unique_count';
const DISPLAY_FORM_NON_EXAMPLES = ['Orders Unique Count', '<Prefix> Unique Count'];

describe('MCP guides', () => {
  it('has a titled guide for every topic', () => {
    for (const topic of MCP_GUIDE_TOPICS) {
      expect(MCP_GUIDES[topic]).toMatch(/^OWOX guide: /);
    }
  });

  it('keeps every secret in browser setup, connector tests included', () => {
    const credentials = MCP_GUIDES.credentials;
    expect(credentials).toContain('start_credential_setup');
    expect(credentials).toContain('get_credential_setup_status');
    expect(credentials).toContain('wait_seconds');
    expect(credentials).toContain('Never accept provider secrets in tool arguments');
    expect(credentials).toContain('Completion does not prove provider validation');
    expect(credentials).toContain('Do not promise a background completion notification');
    expect(MCP_GUIDES.custom_connectors).toContain(
      'test_custom_connector rejects keys in configuration'
    );
    expect(Object.values(MCP_GUIDES).join('\n')).not.toMatch(/temporary key/i);
  });

  it('uses the exact saved Credential when creating a Google Sheets destination', () => {
    const guide = MCP_GUIDES.storages_destinations;
    expect(guide).toContain('add_destination returns setup_id');
    expect(guide).toContain('call get_credential_setup_status');
    expect(guide).toContain('call add_destination again');
    expect(guide).toContain('The browser title names the Credential');
  });

  // The report tools have no Unique Count parameter, and their `fields` reaches the projection
  // verbatim, so a pseudo-field there saves a report that fails on every run.
  it('keeps a joined Unique Count field out of reports', () => {
    expect(MCP_GUIDES.reporting).toContain('in add_report/update_report fields');
  });

  // A model copies the documented example verbatim into `fields`, so the guide must show the SQL
  // name. The display form is recognised only to reach UnmatchedUniqueCountFieldError (#6792).
  it('illustrates the joined Unique Count field with a name the tool recognises', () => {
    expect(hasUniqueCountFieldCandidate([UNIQUE_COUNT_EXAMPLE_FIELD])).toBe(true);
    expect(MCP_GUIDES.reporting).toContain(`"${UNIQUE_COUNT_EXAMPLE_FIELD}"`);
    for (const displayForm of DISPLAY_FORM_NON_EXAMPLES) {
      expect(MCP_GUIDES.reporting).not.toContain(`"${displayForm}"`);
    }
  });

  it('instructs the assistant to use add_report automatic-run outcomes safely', () => {
    const reporting = MCP_GUIDES.reporting;
    expect(reporting).toContain('add_report runs');
    expect(reporting).toContain('run_immediately=false');
    expect(reporting).toContain('initial_run.status="queued"');
    expect(reporting).toContain('initial_run.status="failed_to_queue"');
    expect(reporting).toContain('Never call add_report again');
    expect(reporting).toContain('Confirm the recipients and the message with the user');
  });

  // Keep the report workflow scoped to OWOX-managed exports and preserve the existing-report and
  // spreadsheet grouping guidance.
  it('steers exporting, updating, and grouping reports toward the report tools', () => {
    const reporting = MCP_GUIDES.reporting;
    expect(reporting).toContain('user-requested OWOX-managed export');
    expect(reporting).toContain('One report per user request; then change it.');
    expect(reporting).toContain('error_code similar_report_exists');
    expect(reporting).toContain('allow_similar=true only when the user explicitly');
    expect(reporting).toContain('update_report returns run.status="queued"');
    expect(reporting).toContain('never re-sent by an update unless run_immediately=true');
    expect(reporting).toContain('as spreadsheet_id in the following add_report calls');
  });

  it('guides setup through shared permissions, full replacements, and safe deletion', () => {
    const setup = MCP_GUIDES.data_mart_setup;
    for (const tool of [
      'list_setup_data_marts',
      'get_data_mart_setup',
      'create_data_mart',
      'update_data_mart_definition',
      'validate_data_mart',
      'actualize_data_mart_schema',
      'preview_data_mart',
      'publish_data_mart',
      'get_data_mart_change_impact',
      'update_data_mart_schema',
      'set_data_mart_owners',
      'set_data_mart_contexts',
      'list_connectors',
      'get_connector_specification',
      'get_connector_fields',
      'list_data_mart_relationships',
      'create_data_mart_relationship',
      'update_data_mart_relationship',
      'delete_data_mart_relationship',
    ]) {
      expect(setup).toContain(tool);
    }
    expect(setup).toContain('get_data_mart_setup requires visibility, not edit permission');
    expect(setup).toContain('replace complete lists');
    expect(setup).toContain('Preserve configuration _id and _credential_id');
    expect(setup).toContain('Never pass raw secrets');
    expect(setup).toContain('obtain user authorization before delete_data_mart');
  });

  it('guides runs and schedules through safe status checks', () => {
    const runs = MCP_GUIDES.data_mart_runs;
    for (const tool of [
      'run_data_mart',
      'get_data_mart_run',
      'list_data_mart_runs',
      'cancel_data_mart_run',
      'list_data_mart_run_schedules',
      'create_data_mart_run_schedule',
      'update_data_mart_run_schedule',
      'delete_data_mart_run_schedule',
    ]) {
      expect(runs).toContain(tool);
    }
    expect(runs).toContain('published status does not prove data readiness');
    expect(runs).toContain('Do not call run_data_mart again just to poll');
  });

  it('distinguishes a backfill segment from completion of the requested period', () => {
    const runs = MCP_GUIDES.data_mart_runs;
    expect(runs).toContain('should_poll describes only the returned run segment');
    expect(runs).toContain('backfill.chain_id');
    expect(runs).toContain('segment_index');
    expect(runs).toContain('segments_total');
    expect(runs).toContain('offset');
    expect(runs).toContain('A failed segment can be followed by later segments');
  });

  // The test calls a live API: it can change external data and refresh Credential tokens.
  it('does not describe a connector test as free of side effects', () => {
    expect(MCP_GUIDES.custom_connectors).not.toContain('without saving');
    expect(MCP_GUIDES.custom_connectors).toContain('can change external data');
  });
});
