import { buildMcpBusExtras, mcpSpanMapper, mcpOffloadPathBuilder } from './mcp-bus-wiring';

describe('mcp-bus-wiring', () => {
  it('mcpSpanMapper maps tool name / conversation / status / duration', () => {
    const info = mcpSpanMapper({
      name: 'mcp.tool_call',
      payload: {
        mcp_tool_name: 'list_data_marts',
        owox_conversation_id: 'c1',
        mcp_tool_status: 'error',
        duration_ms: 9,
      },
    } as never);
    expect(info).toEqual({ name: 'list_data_marts', groupId: 'c1', durationMs: 9, isError: true });
  });

  it('mcpSpanMapper falls back to event.name and non-error', () => {
    const info = mcpSpanMapper({ name: 'mcp.tool_call', payload: {} } as never);
    expect(info.name).toBe('mcp.tool_call');
    expect(info.isError).toBe(false);
    expect(info.groupId).toBeUndefined();
  });

  it('mcpOffloadPathBuilder builds mcp/<date>/<project>/<request>-<nonce>.json', () => {
    const path = mcpOffloadPathBuilder({ owox_project_id: 'p1', owox_request_id: 'r1' });
    expect(path).toMatch(/^mcp\/\d{4}-\d{2}-\d{2}\/p1\/r1-[0-9a-f]{8}\.json$/);
  });

  it('buildMcpBusExtras returns an offloader; OTLP transport only when MCP_OTEL_ENABLED', () => {
    const off = buildMcpBusExtras({ MCP_LOG_GCS_BUCKET: 'b' } as NodeJS.ProcessEnv);
    expect(off.offloader).toBeDefined();
    expect(off.extraTransports ?? []).toHaveLength(0);

    const withOtel = buildMcpBusExtras({ MCP_OTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);
    expect((withOtel.extraTransports ?? []).some(t => t.name === 'otlp')).toBe(true);
  });

  it('the wired OTLP transport restricts to mcp.* events (PII boundary)', () => {
    const withOtel = buildMcpBusExtras({ MCP_OTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);
    const otlp = (withOtel.extraTransports ?? []).find(t => t.name === 'otlp');
    expect(otlp).toBeDefined();
    // Deleting `eventNamePrefixes: ['mcp.']` from buildMcpOtlpTransport must fail here: without it,
    // PII-bearing insights events would reach the external OTLP backend.
    expect((otlp as unknown as { prefixes?: readonly string[] }).prefixes).toEqual(['mcp.']);
  });

  it('by default payloads are never inlined (PII out of logs): no bucket → none, bucket → gcs offload-only', () => {
    const noBucket = buildMcpBusExtras({} as NodeJS.ProcessEnv);
    expect((noBucket.offloader as unknown as { config: { sink: string } }).config.sink).toBe(
      'none'
    );

    const bucket = buildMcpBusExtras({ MCP_LOG_GCS_BUCKET: 'b' } as NodeJS.ProcessEnv);
    const cfg = (
      bucket.offloader as unknown as { config: { sink: string; inlineMaxBytes: number } }
    ).config;
    expect(cfg.sink).toBe('gcs');
    expect(cfg.inlineMaxBytes).toBe(0); // never inline; every payload offloaded to the GCS tier
  });

  it('MCP_LOG_INLINE_PAYLOADS=true opts into inlining (accepting client data in logs)', () => {
    const noBucket = buildMcpBusExtras({ MCP_LOG_INLINE_PAYLOADS: 'true' } as NodeJS.ProcessEnv);
    expect((noBucket.offloader as unknown as { config: { sink: string } }).config.sink).toBe(
      'inline'
    );

    const bucket = buildMcpBusExtras({
      MCP_LOG_GCS_BUCKET: 'b',
      MCP_LOG_INLINE_PAYLOADS: 'true',
    } as NodeJS.ProcessEnv);
    const cfg = (
      bucket.offloader as unknown as { config: { sink: string; inlineMaxBytes: number } }
    ).config;
    expect(cfg.sink).toBe('gcs');
    expect(cfg.inlineMaxBytes).toBe(4096); // threshold applies only when inline is opted in
  });

  it('MCP_OTEL_ENABLED must be exactly "true" — a truthy-but-not-true value does not enable OTLP', () => {
    const loose = buildMcpBusExtras({ MCP_OTEL_ENABLED: '1' } as NodeJS.ProcessEnv);
    expect((loose.extraTransports ?? []).some(t => t.name === 'otlp')).toBe(false);
  });

  it('buildMcpBusExtras exposes a shutdown() that is safe to call when OTLP is off', async () => {
    const extras = buildMcpBusExtras({} as NodeJS.ProcessEnv);
    expect(typeof extras.shutdown).toBe('function');
    await expect(extras.shutdown()).resolves.toBeUndefined();
  });

  it('buildMcpBusExtras keeps the gcs sink when MCP_LOG_INLINE_MAX_BYTES is invalid but the bucket is valid', () => {
    const bad = buildMcpBusExtras({
      MCP_LOG_GCS_BUCKET: 'b',
      MCP_LOG_INLINE_MAX_BYTES: '0',
    } as NodeJS.ProcessEnv);
    expect((bad.offloader as unknown as { config: { sink: string } }).config.sink).toBe('gcs');
  });
});
