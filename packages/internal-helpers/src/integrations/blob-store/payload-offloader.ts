import type { BlobStore } from './types.js';
import { LoggerFactory } from '../../logging/logger-factory.js';
import { castError } from '../../utils/castError.js';

export type { BlobStore };

/** Reserved payload key. Its value (an object of bulky fields) is a candidate for offloading. */
export const OFFLOAD_KEY = '__offload__' as const;

export type PayloadSink = 'gcs' | 'inline' | 'none';

export interface PayloadOffloaderConfig {
  sink: PayloadSink;
  inlineMaxBytes: number;
  blobStore?: BlobStore;
  pathBuilder?: (payload: Record<string, unknown>) => string;
}

/**
 * Moves a payload's bulky fields (under {@link OFFLOAD_KEY}) out of the inline record.
 * Generic — knows nothing about MCP. Mutates the passed payload in place and never throws:
 * offload failure degrades to a marker, the record is still emitted.
 */
export class PayloadOffloader {
  private readonly logger = LoggerFactory.createNamedLogger('PayloadOffloader');

  constructor(private readonly config: PayloadOffloaderConfig) {}

  async apply(payload: Record<string, unknown>): Promise<void> {
    const blob = payload[OFFLOAD_KEY];
    delete payload[OFFLOAD_KEY];
    if (blob === undefined || blob === null) return;

    // Never throw once the reserved key is consumed: any failure (e.g. JSON.stringify on a
    // circular/BigInt blob) degrades to a marker so the record is still emitted.
    let bytes: number | undefined;
    try {
      const json = JSON.stringify(blob);
      bytes = Buffer.byteLength(json, 'utf8');

      if (this.config.sink === 'none') return;

      if (this.config.sink === 'inline' || !this.config.blobStore || !this.config.pathBuilder) {
        if (bytes <= this.config.inlineMaxBytes) {
          Object.assign(payload, blob as Record<string, unknown>);
        } else {
          payload['owox_payload_truncated'] = true;
          payload['owox_payload_bytes'] = bytes;
        }
        return;
      }

      // gcs sink: small payloads stay inline (queryable in logs/traces); only oversized ones
      // are offloaded to keep the log line and span attributes bounded.
      if (bytes <= this.config.inlineMaxBytes) {
        Object.assign(payload, blob as Record<string, unknown>);
        return;
      }

      const uri = await this.config.blobStore.put(this.config.pathBuilder(payload), json);
      payload['owox_payload_ref'] = uri;
    } catch (error) {
      const reason = castError(error).message;
      payload['owox_payload_error'] = true;
      if (bytes !== undefined) payload['owox_payload_bytes'] = bytes;
      payload['owox_payload_error_reason'] =
        reason.length > 200 ? `${reason.slice(0, 200)}…` : reason;
      this.logger.warn('Payload offload failed', { error: reason });
    }
  }
}
