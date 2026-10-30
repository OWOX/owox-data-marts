/** The connector a Source provider serves; definitions from an older backend carry none. */
export function servedConnector(definition: {
  connectors?: readonly string[];
}): string | undefined {
  return definition.connectors?.[0];
}
