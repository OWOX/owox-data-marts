import { ForbiddenException } from '@nestjs/common';
import { OFFLOAD_KEY } from '@owox/internal-helpers';
import { dataMartConfiguration, mcpContext } from '../../../../test/fixtures/mcp-configuration';
import {
  DataMartDefinitionType,
  type McpDataMartConfiguration,
  type McpDataMartSetupFacade,
} from '../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpConnectorsFacade } from '../../../data-marts/facades/mcp-connectors.facade';
import { ConnectorFieldsPreviewService } from '../../../data-marts/services/connector/connector-fields-preview.service';
import { PreviewConnectorFieldOptionsTool } from '../tools/connector/preview-connector-field-options.tool';
import { PreviewConnectorFieldsTool } from '../tools/connector/preview-connector-fields.tool';
import { UpdateDataMartDefinitionTool } from '../tools/data-mart/update-data-mart-definition.tool';
import type { McpToolDefinition, McpToolResult } from '../tools/mcp-tool.definition';
import { McpCallInstrumentation } from './mcp-call-instrumentation';
import type { McpToolCallEvent } from './mcp-tool-call-event';
import { MCP_TOOL_DIAGNOSTICS_KEY } from './mcp-tool-diagnostics';

const makeDispatcher = () => ({ publishExternalSafely: jest.fn() });
// Key-aware fake: diagnostics for MCP_TOOL_DIAGNOSTICS_KEY, log context otherwise. (_meta is no
// longer a CLS slot — it arrives per-call in the SDK `extra`.)
const makeCls = (
  ctx: Record<string, unknown> = { projectId: 'p1', requestId: 'r1' },
  diag: Record<string, unknown> = {}
) => ({
  get: jest.fn((key: string) => (key === MCP_TOOL_DIAGNOSTICS_KEY ? diag : ctx)),
  set: jest.fn(),
});

// Stateful fake: a real store keyed by the CLS key string, so `set`/`update` from call 1
// are actually visible (or correctly cleared) when call 2 reads via `get`.
const makeStatefulCls = (ctx: Record<string, unknown> = { projectId: 'p1', requestId: 'r1' }) => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    get: jest.fn((key: string) => (key === MCP_TOOL_DIAGNOSTICS_KEY ? store.get(key) : ctx)),
    set: jest.fn((key: string, value: Record<string, unknown>) => {
      store.set(key, value);
    }),
    update: jest.fn((key: string, partial: Record<string, unknown>) => {
      store.set(key, { ...(store.get(key) ?? {}), ...partial });
    }),
  };
};

describe('McpCallInstrumentation', () => {
  it('keeps a real connector validation error for the client while excluding its echoed value from telemetry', async () => {
    const value = 'SYNTHETIC_PRIVATE_HEADER_ROW';
    const preview = new ConnectorFieldsPreviewService({
      inject: async (_name: string, configuration: Record<string, unknown>) => configuration,
    } as never);
    const dispatcher = { publishExternalSafely: jest.fn<void, [McpToolCallEvent]>() };
    const instrumentation = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const wrapped = instrumentation.wrap('preview_connector_fields', async () => {
      await preview.run(
        { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
        'GoogleSheets',
        {
          AuthType: { service_account: { ServiceAccountKey: 'synthetic-key' } },
          SpreadsheetId: 'sheet-id',
          SheetName: 'Sheet1',
          HeaderRow: value,
        }
      );
      return { content: [] };
    });

    await expect(wrapped({ configuration: { HeaderRow: value } })).rejects.toThrow(value);
    const event = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(event.payload.error_type).toBe('BadRequestException');
    expect(event.payload.mcp_tool_status).toBe('error');
    expect(JSON.stringify(event)).not.toContain(value);
  });

  describe.each(['preview_connector_fields', 'preview_connector_field_options'] as const)(
    '%s configuration telemetry',
    toolName => {
      it.each(['success', 'error'] as const)(
        'suppresses the entire configuration on %s while preserving arguments and outcome',
        async outcome => {
          const serviceAccountKey = 'SYNTHETIC_PREVIEW_PRIVATE_KEY';
          const opaqueSetting = 'SYNTHETIC_PREVIEW_VENDOR_VALUE';
          const configuration = {
            AuthType: { service_account: { ServiceAccountKey: serviceAccountKey } },
            OpaqueSetting: opaqueSetting,
            SpreadsheetId: 'sheet-1',
          };
          const sourceDataMartId = 'b7c2b085-9ebe-4ba0-85ce-6e713a00c0ad';
          const input = {
            connector_name: 'GoogleSheets',
            configuration,
            source_data_mart_id: sourceDataMartId,
            source_configuration_id: 'configuration-1',
            ...(toolName === 'preview_connector_field_options' ? { field: 'SheetId' } : {}),
          };
          const originalInput = JSON.stringify(input);
          const nodes = [{ name: 'sheets', fields: [{ name: 'id', type: 'string' }] }];
          const options = [{ value: 'sheet-1', label: 'Orders' }];
          const facade: jest.Mocked<
            Pick<McpConnectorsFacade, 'previewConnectorFields' | 'previewConnectorFieldOptions'>
          > = {
            previewConnectorFields: jest.fn().mockResolvedValue(nodes),
            previewConnectorFieldOptions: jest.fn().mockResolvedValue(options),
          };
          const method =
            toolName === 'preview_connector_fields'
              ? facade.previewConnectorFields
              : facade.previewConnectorFieldOptions;
          const error = new ForbiddenException('Cannot use source Data Mart');
          if (outcome === 'error') method.mockRejectedValue(error);
          const tool: McpToolDefinition =
            toolName === 'preview_connector_fields'
              ? new PreviewConnectorFieldsTool(facade as unknown as McpConnectorsFacade)
              : new PreviewConnectorFieldOptionsTool(facade as unknown as McpConnectorsFacade);
          const dispatcher = { publishExternalSafely: jest.fn<void, [McpToolCallEvent]>() };
          const instrumentation = new McpCallInstrumentation(
            dispatcher as never,
            makeCls() as never
          );
          let handlerResult: McpToolResult | undefined;
          const wrapped = instrumentation.wrap(tool.name, async args => {
            handlerResult = await tool.handler(args, mcpContext);
            return handlerResult;
          });

          if (outcome === 'error') await expect(wrapped(input)).rejects.toBe(error);
          else {
            const result = await wrapped(input);
            expect(result).toBe(handlerResult);
            expect(result.structuredContent).toMatchObject(
              toolName === 'preview_connector_fields' ? { nodes } : { options }
            );
          }

          expect(method).toHaveBeenCalledWith(
            { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
            {
              connectorName: 'GoogleSheets',
              configuration,
              sourceDataMartId,
              sourceConfigurationId: 'configuration-1',
              ...(toolName === 'preview_connector_field_options' ? { field: 'SheetId' } : {}),
            }
          );
          expect(JSON.stringify(input)).toBe(originalInput);
          expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
          const event = dispatcher.publishExternalSafely.mock.calls[0][0];
          expect(event.payload.mcp_tool_status).toBe(outcome === 'error' ? 'error' : 'ok');
          expect(event.payload[OFFLOAD_KEY]).toMatchObject({
            arguments: { ...input, configuration: '[REDACTED]' },
          });
          expect(JSON.stringify(event)).not.toContain(serviceAccountKey);
          expect(JSON.stringify(event)).not.toContain(opaqueSetting);
          expect(JSON.stringify(event)).not.toContain('SpreadsheetId');
        }
      );
    }
  );

  it.each(['success', 'error'] as const)(
    'excludes connector credentials from telemetry on %s without changing tool arguments or outcome',
    async outcome => {
      const serviceAccountKey = 'SYNTHETIC_SERVICE_ACCOUNT_PRIVATE_KEY';
      const opaqueSetting = 'SYNTHETIC_VENDOR_VALUE';
      const connector = {
        source: {
          name: 'GoogleSheets',
          configuration: [
            {
              AuthType: { service_account: { ServiceAccountKey: serviceAccountKey } },
              OpaqueSetting: opaqueSetting,
              SpreadsheetId: 'sheet-1',
            },
          ],
          node: 'sheets',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'project.dataset.target' },
      };
      const input = {
        data_mart_id: 'mart-1',
        definition: { type: DataMartDefinitionType.CONNECTOR, connector },
      };
      const originalInput = JSON.stringify(input);
      const saved: McpDataMartConfiguration = {
        ...dataMartConfiguration,
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: {
          connector: {
            ...connector,
            source: {
              ...connector.source,
              configuration: [
                {
                  AuthType: { service_account: { ServiceAccountKey: '**********' } },
                  OpaqueSetting: '**********',
                  SpreadsheetId: 'sheet-1',
                },
              ],
            },
          },
        },
      };
      const error = new ForbiddenException('Cannot edit this Data Mart');
      const facade: jest.Mocked<Pick<McpDataMartSetupFacade, 'updateDataMartDefinition'>> = {
        updateDataMartDefinition: jest.fn(),
      };
      if (outcome === 'error') facade.updateDataMartDefinition.mockRejectedValue(error);
      else facade.updateDataMartDefinition.mockResolvedValue(saved);
      const tool = new UpdateDataMartDefinitionTool(facade as unknown as McpDataMartSetupFacade);
      const dispatcher = { publishExternalSafely: jest.fn<void, [McpToolCallEvent]>() };
      const instrumentation = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
      const wrapped = instrumentation.wrap(tool.name, args =>
        tool.handler(tool.parseInput(args), mcpContext)
      );

      if (outcome === 'error') await expect(wrapped(input)).rejects.toBe(error);
      else
        await expect(wrapped(input)).resolves.toMatchObject({
          structuredContent: { data_mart: saved },
        });

      expect(facade.updateDataMartDefinition).toHaveBeenCalledWith(
        { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
        {
          dataMartId: 'mart-1',
          definitionType: DataMartDefinitionType.CONNECTOR,
          definition: { connector },
        }
      );
      expect(JSON.stringify(input)).toBe(originalInput);
      expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
      const event = dispatcher.publishExternalSafely.mock.calls[0][0];
      expect(event.payload.mcp_tool_status).toBe(outcome === 'error' ? 'error' : 'ok');
      expect(event.payload[OFFLOAD_KEY]).toMatchObject({
        arguments: {
          data_mart_id: 'mart-1',
          definition: {
            type: 'CONNECTOR',
            connector: {
              source: {
                name: 'GoogleSheets',
                configuration: '[REDACTED]',
                node: 'sheets',
                fields: ['id'],
              },
              storage: { fullyQualifiedName: 'project.dataset.target' },
            },
          },
        },
      });
      expect(JSON.stringify(event)).not.toContain(serviceAccountKey);
      expect(JSON.stringify(event)).not.toContain(opaqueSetting);
    }
  );

  it('зберігає результат handler і емітить подію success', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const result = { content: [{ type: 'text' as const, text: 'ok' }] };
    const wrapped = instr.wrap('query_data_mart', async () => result);

    await expect(wrapped({ id: 'dm1' })).resolves.toBe(result);
    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.name).toBe('mcp.tool_call');
    expect(ev.payload['mcp_tool_status']).toBe('ok');
    expect(ev.payload['owox_project_id']).toBe('p1');
  });

  it('прокидає помилку handler незмінно і емітить подію error', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const boom = new Error('boom');
    const wrapped = instr.wrap('run_report', async () => {
      throw boom;
    });

    await expect(wrapped({})).rejects.toBe(boom);
    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    expect(dispatcher.publishExternalSafely.mock.calls[0][0].payload['mcp_tool_status']).toBe(
      'error'
    );
  });

  it('провал емісії НЕ ламає tool-call', async () => {
    const dispatcher = {
      publishExternalSafely: jest.fn(() => {
        throw new Error('emit fail');
      }),
    };
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const result = { content: [] };
    const wrapped = instr.wrap('x', async () => result);
    await expect(wrapped({})).resolves.toBe(result);
  });

  it('прокидає abort signal у handler', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const handler = jest.fn(async () => ({ content: [] }));
    const wrapped = instr.wrap('x', handler);
    const signal = new AbortController().signal;
    await wrapped({ a: 1 }, { mcpReq: { signal } } as never);
    expect(handler).toHaveBeenCalledWith({ a: 1 }, { mcpReq: { signal } });
  });

  it('executedSql з CLS-діагностики потрапляє у подію', async () => {
    const dispatcher = makeDispatcher();
    const cls = makeCls({ projectId: 'p1' }, { executedSql: 'SELECT 42' });
    const instr = new McpCallInstrumentation(dispatcher as never, cls as never);
    const wrapped = instr.wrap('query_data_mart', async () => ({ content: [] }));
    await wrapped({});
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.payload['__offload__']['sql']).toBe('SELECT 42');
  });

  it('очищає діагностику per-call: SQL попереднього виклику не протікає у наступний tool', async () => {
    const dispatcher = makeDispatcher();
    const cls = makeStatefulCls();
    const instr = new McpCallInstrumentation(dispatcher as never, cls as never);

    const queryHandler = instr.wrap('query_data_mart', async () => {
      cls.update(MCP_TOOL_DIAGNOSTICS_KEY, { executedSql: 'SELECT 1' });
      return { content: [] };
    });
    const otherHandler = instr.wrap('list_data_marts', async () => ({ content: [] }));

    await queryHandler({});
    await otherHandler({});

    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(2);
    const firstEvent = dispatcher.publishExternalSafely.mock.calls[0][0];
    const secondEvent = dispatcher.publishExternalSafely.mock.calls[1][0];
    expect(firstEvent.payload['__offload__']['sql']).toBe('SELECT 1');
    expect(secondEvent.payload['__offload__']['sql']).toBeUndefined();
  });

  it('per-call _meta з SDK extra дає conversation id у події', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(
      dispatcher as never,
      makeCls({ projectId: 'p1' }) as never
    );
    const wrapped = instr.wrap('query_data_mart', async () => ({ content: [] }));
    await wrapped({}, { mcpReq: { _meta: { 'openai/session': 'sess-x' } } } as never);
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.payload['owox_conversation_id']).toBe('sess-x');
    expect(ev.payload['owox_conversation_id_is_pseudo']).toBe(false);
  });

  it('батч: кожен виклик бере власний _meta з extra, а не перший на весь запит', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(
      dispatcher as never,
      makeCls({ projectId: 'p1' }) as never
    );
    const callA = instr.wrap('query_data_mart', async () => ({ content: [] }));
    const callB = instr.wrap('list_data_marts', async () => ({ content: [] }));

    // Two JSON-RPC messages in one batch, each with its own conversation _meta.
    await callA({}, { mcpReq: { _meta: { 'openai/session': 'conv-A' } } } as never);
    await callB({}, { mcpReq: { _meta: { 'openai/session': 'conv-B' } } } as never);

    const [evA, evB] = dispatcher.publishExternalSafely.mock.calls.map(c => c[0]);
    expect(evA.payload['owox_conversation_id']).toBe('conv-A');
    expect(evB.payload['owox_conversation_id']).toBe('conv-B');
    expect(evA.payload['owox_conversation_id']).not.toBe(evB.payload['owox_conversation_id']);
  });
});
