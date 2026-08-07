import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuthorizationContext } from '../../../idp';
import { PLUGIN_COLLECTION_LIMITS } from '../constants/plugin-collection-limits';
import type {
  GetPluginCollectionCommand,
  JsonValue,
  ListPluginCollectionCommand,
  PluginCollectionDocumentDto,
  PluginCollectionRuntimeContext,
  PutPluginCollectionCommand,
} from '../dto/domain/plugin-collection.types';
import type { PutPluginCollectionDocumentApiDto } from '../dto/presentation/plugin-collection-api.dto';
import { PluginCollectionDocument } from '../entities/plugin-collection-document.collection.entity';
import {
  PluginCollectionAuthorizationDeniedError,
  PluginCollectionValidationError,
} from '../errors/plugin-collection.errors';

const JsonValueSchema: z.ZodType<JsonValue> = z.any().superRefine((root, context) => {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) continue;
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'JSON numbers must be finite' });
      return;
    }
    if (typeof value !== 'object') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsupported JSON value' });
      return;
    }
    if (depth >= PLUGIN_COLLECTION_LIMITS.maxDocumentDepth) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `JSON nesting exceeds ${PLUGIN_COLLECTION_LIMITS.maxDocumentDepth}`,
      });
      return;
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) stack.push({ value: child, depth: depth + 1 });
  }
});

@Injectable()
export class PluginCollectionMapper {
  toListCommand(
    collectionName: string,
    limit: string | undefined,
    cursor: string | undefined,
    context: AuthorizationContext
  ): ListPluginCollectionCommand {
    const parsedLimit =
      limit === undefined ? PLUGIN_COLLECTION_LIMITS.defaultPageSize : Number(limit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > PLUGIN_COLLECTION_LIMITS.maxPageSize
    ) {
      throw new PluginCollectionValidationError(
        `limit must be an integer from 1 to ${PLUGIN_COLLECTION_LIMITS.maxPageSize}`
      );
    }
    return {
      collectionName: this.collectionName(collectionName),
      limit: parsedLimit,
      cursor: cursor ?? null,
      context: this.runtimeContext(context),
    };
  }

  toGetCommand(
    collectionName: string,
    documentId: string,
    context: AuthorizationContext
  ): GetPluginCollectionCommand {
    return {
      collectionName: this.collectionName(collectionName),
      documentId: this.documentId(documentId),
      context: this.runtimeContext(context),
    };
  }

  toPutCommand(
    collectionName: string,
    documentId: string,
    dto: PutPluginCollectionDocumentApiDto,
    context: AuthorizationContext
  ): PutPluginCollectionCommand {
    const document = JsonValueSchema.safeParse(dto.document);
    if (!document.success) {
      throw new PluginCollectionValidationError(
        `document must be valid JSON with at most ${PLUGIN_COLLECTION_LIMITS.maxDocumentDepth} nested containers`
      );
    }
    return {
      ...this.toGetCommand(collectionName, documentId, context),
      document: document.data,
      parentId: dto.parentId?.trim() || null,
    };
  }

  toResponse(entity: PluginCollectionDocument): PluginCollectionDocumentDto {
    return {
      id: entity.documentId,
      ...(entity.parentId ? { parentId: entity.parentId } : {}),
      document: entity.document as JsonValue,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.modifiedAt.toISOString(),
    };
  }

  private runtimeContext(context: AuthorizationContext): PluginCollectionRuntimeContext {
    if (!context.pluginId || !context.installationId || context.authFlow !== 'plugin') {
      throw new PluginCollectionAuthorizationDeniedError();
    }
    return { ...context, pluginId: context.pluginId, installationId: context.installationId };
  }

  private collectionName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 64 || trimmed === '.' || trimmed === '..') {
      throw new PluginCollectionValidationError('Invalid collection name');
    }
    return trimmed;
  }

  private documentId(id: string): string {
    if (
      !id ||
      id === '.' ||
      id === '..' ||
      Buffer.byteLength(id, 'utf8') > PLUGIN_COLLECTION_LIMITS.maxDocumentIdBytes
    ) {
      throw new PluginCollectionValidationError('Invalid document id');
    }
    return id;
  }
}
