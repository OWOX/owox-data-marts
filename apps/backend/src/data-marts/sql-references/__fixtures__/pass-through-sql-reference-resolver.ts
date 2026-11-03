/**
 * Stands in for `DataMartSqlReferenceResolver` in specs whose Data Marts reference no other Data
 * Mart: every definition and query comes back exactly as given.
 */
export const passThroughSqlReferenceResolver = {
  hasReferences: (): boolean => false,
  expandSql: async (sql: string): Promise<string> => sql,
  resolveDefinition: async <T>(dataMart: { definition?: T }): Promise<T | undefined> =>
    dataMart.definition,
  withResolvedDefinition: async <T>(dataMart: T): Promise<T> => dataMart,
  withResolvedDataMart: async <T>(holder: T): Promise<T> => holder,
  inlineSource: async (): Promise<string | null> => null,
  findReferencedDataMarts: async (): Promise<never[]> => [],
};

/** Stands in for `DataMartSqlReferenceValidator`: every query is accepted as written. */
export const passThroughSqlReferenceValidator = {
  prepareForSave: async ({ sqlQuery }: { sqlQuery: string }): Promise<string> => sqlQuery,
};
