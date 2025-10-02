import { z } from 'zod';
import { DataMartDefinitionType } from '../../../shared';
import { DataStorageType } from '../../../../data-storage';
import { createFullyQualifiedNameSchema, createTablePatternSchema } from '../../../shared';

const sqlDefinitionSchema = z.object({
  definitionType: z.literal(DataMartDefinitionType.SQL),
  definition: z.object({
    sqlQuery: z.string().min(1, 'SQL query is required'),
  }),
});

const createTableDefinitionSchema = (storageType: DataStorageType) => {
  const schema = createFullyQualifiedNameSchema(storageType);
  return z.object({
    definitionType: z.literal(DataMartDefinitionType.TABLE),
    definition: schema,
  });
};

const createViewDefinitionSchema = (storageType: DataStorageType) => {
  const schema = createFullyQualifiedNameSchema(storageType);
  return z.object({
    definitionType: z.literal(DataMartDefinitionType.VIEW),
    definition: schema,
  });
};

const createTablePatternDefinitionSchema = (storageType: DataStorageType) => {
  const schema = createTablePatternSchema(storageType);
  return z.object({
    definitionType: z.literal(DataMartDefinitionType.TABLE_PATTERN),
    definition: schema,
  });
};

const connectorDefinitionSchema = z.object({
  definitionType: z.literal(DataMartDefinitionType.CONNECTOR),
  definition: z.object({
    connector: z.object({
      source: z.object({
        name: z.string().min(1, 'Connector name is required'),
        configuration: z
          .array(z.record(z.unknown()))
          .min(1, 'At least one configuration is required'),
        node: z.string().min(1, 'Node is required'),
        fields: z.array(z.string()).min(1, 'At least one field is required'),
      }),
      storage: z.object({
        fullyQualifiedName: z.string().min(1, 'fully qualified name is required'),
      }),
    }),
  }),
});

export const createDataMartDefinitionSchema = (
  definitionType: DataMartDefinitionType | null,
  storageType: DataStorageType
) => {
  if (!definitionType) {
    return z.object({
      definitionType: z.nullable(z.nativeEnum(DataMartDefinitionType)),
      definition: z.object({}).optional(),
    });
  }

  switch (definitionType) {
    case DataMartDefinitionType.SQL:
      return sqlDefinitionSchema;
    case DataMartDefinitionType.TABLE:
      return createTableDefinitionSchema(storageType);
    case DataMartDefinitionType.VIEW:
      return createViewDefinitionSchema(storageType);
    case DataMartDefinitionType.TABLE_PATTERN:
      return createTablePatternDefinitionSchema(storageType);
    case DataMartDefinitionType.CONNECTOR:
      return connectorDefinitionSchema;
    default:
      return z.object({});
  }
};

export type SqlDefinitionFormData = z.infer<typeof sqlDefinitionSchema>;

export type TableDefinitionFormData = z.infer<ReturnType<typeof createTableDefinitionSchema>>;

export type ViewDefinitionFormData = z.infer<ReturnType<typeof createViewDefinitionSchema>>;

export type TablePatternDefinitionFormData = z.infer<
  ReturnType<typeof createTablePatternDefinitionSchema>
>;

export type ConnectorDefinitionFormData = z.infer<typeof connectorDefinitionSchema>;

export type DataMartDefinitionFormData =
  | SqlDefinitionFormData
  | TableDefinitionFormData
  | ViewDefinitionFormData
  | TablePatternDefinitionFormData
  | ConnectorDefinitionFormData;
