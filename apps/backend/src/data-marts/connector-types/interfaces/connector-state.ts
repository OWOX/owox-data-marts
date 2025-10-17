export interface ConnectorStateItem {
  _id: string;
  state: Record<string, unknown>;
  at: string;
}

export interface ConnectorState {
  state?: Record<string, unknown>; // Deprecated: for backward compatibility
  at?: string;
  states?: ConnectorStateItem[]; // New: array of states per configuration
}
