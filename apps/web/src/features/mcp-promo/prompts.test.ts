import { describe, expect, it } from 'vitest';
import {
  buildMcpPrompt,
  chatGptNewChatUrl,
  claudeNewChatUrl,
  type McpPromptPlacement,
  setupGuideUrl,
} from './prompts';

const ids = {
  projectId: 'p1',
  dataMartId: 'dm1',
  storageId: 's1',
  destinationId: 'd1',
  contextId: 'c1',
  reportId: 'r1',
};
const guide = 'https://docs.owox.com/docs/getting-started/setup-guide/mcp/';
const wrap = (task: string) =>
  `Use the OWOX Data Marts connector to ${task} First check that the connector uses this project. If the connector is not connected, help me connect it with ${guide}`;

const cases: [McpPromptPlacement, string][] = [
  ['create_data_mart', 'help me create a Data Mart in project p1.'],
  [
    'data_setup_toast',
    'help me finish the setup of Data Mart dm1 in project p1. Do not create another Data Mart.',
  ],
  [
    'data_setup_card',
    'help me finish the setup of Data Mart dm1 in project p1. Do not create another Data Mart.',
  ],
  [
    'data_setup_card_maintain',
    'help me maintain Data Mart dm1 in project p1. Do not create another Data Mart.',
  ],
  ['overview_card', 'answer my questions with Data Mart dm1 in project p1.'],
  [
    'storage_sheet',
    'help me finish configuring Storage s1 in project p1. Do not create another Storage.',
  ],
  [
    'data_setup_storage_hint',
    'help me finish configuring Storage s1 in project p1. Do not create another Storage.',
  ],
  [
    'storage_sheet_maintain',
    'help me maintain Storage s1 in project p1. Do not create another Storage.',
  ],
  ['destination_sheet', 'help me add a Destination to project p1.'],
  [
    'destination_sheet_maintain',
    'help me maintain Destination d1 in project p1. Do not create another Destination.',
  ],
  ['credential_sheet', 'help me add a Credential to project p1.'],
  ['context_sheet', 'help me create a Context in project p1.'],
  [
    'context_sheet_maintain',
    'help me maintain Context c1 in project p1. Do not create another Context.',
  ],
  ['connector_builder', 'help me build a custom connector in project p1.'],
  ['report_sheet', 'help me create a report for Data Mart dm1 in Destination d1 in project p1.'],
  [
    'report_sheet_maintain',
    'help me maintain report r1 of Data Mart dm1 in project p1. Do not create another report.',
  ],
  ['empty_project', 'help me set up my first Data Mart in project p1.'],
];

describe('buildMcpPrompt', () => {
  it.each(cases)('builds the %s prompt', (placement, task) => {
    expect(buildMcpPrompt(placement, ids)).toBe(wrap(task));
  });

  it('asks to maintain a published custom connector', () => {
    expect(buildMcpPrompt('connector_builder_maintain', { ...ids, connectorId: 'c1' })).toBe(
      wrap(
        'help me maintain the custom connector c1 in project p1. Do not create another custom connector.'
      )
    );
  });

  it('names the custom connector when it has an id', () => {
    expect(buildMcpPrompt('connector_builder', { ...ids, connectorId: 'c1' })).toBe(
      wrap(
        'help me finish the custom connector c1 in project p1. Do not create another custom connector.'
      )
    );
  });

  it('throws when a required id is missing', () => {
    expect(() => buildMcpPrompt('overview_card', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('data_setup_card', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('data_setup_card_maintain', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('storage_sheet', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('storage_sheet_maintain', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('destination_sheet_maintain', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('context_sheet_maintain', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('connector_builder_maintain', { projectId: 'p1' })).toThrow();
    expect(() => buildMcpPrompt('report_sheet', { projectId: 'p1', dataMartId: 'dm1' })).toThrow();
    expect(() =>
      buildMcpPrompt('report_sheet', { projectId: 'p1', destinationId: 'd1' })
    ).toThrow();
    expect(() =>
      buildMcpPrompt('report_sheet_maintain', { projectId: 'p1', dataMartId: 'dm1' })
    ).toThrow();
    expect(() =>
      buildMcpPrompt('report_sheet_maintain', { projectId: 'p1', reportId: 'r1' })
    ).toThrow();
  });
});

describe('new chat urls', () => {
  const prompt = buildMcpPrompt('create_data_mart', ids);

  it('round-trips the prompt through the q parameter', () => {
    const claude = new URL(claudeNewChatUrl(prompt));
    const chatGpt = new URL(chatGptNewChatUrl(prompt));
    expect(claude.origin + claude.pathname).toBe('https://claude.ai/new');
    expect(chatGpt.origin).toBe('https://chatgpt.com');
    expect(claude.searchParams.get('q')).toBe(prompt);
    expect(chatGpt.searchParams.get('q')).toBe(prompt);
  });

  it('encodes reserved characters in the q parameter', () => {
    const text = 'a & b # c + d % e = f';
    for (const builder of [claudeNewChatUrl, chatGptNewChatUrl]) {
      expect(new URL(builder(text)).searchParams.get('q')).toBe(text);
    }
  });
});

describe('setupGuideUrl', () => {
  it('adds UTM parameters', () => {
    const url = new URL(setupGuideUrl('reports_hint'));
    expect(url.origin + url.pathname).toBe(guide);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'owox_data_marts',
      utm_medium: 'reports_hint',
      utm_campaign: 'mcp_promo',
    });
  });

  it('takes an explicit medium and campaign', () => {
    expect(setupGuideUrl('reports_promo', { medium: 'm_1', campaign: 'c_1' })).toBe(
      `${guide}?utm_source=owox_data_marts&utm_medium=m_1&utm_campaign=c_1`
    );
  });
});
