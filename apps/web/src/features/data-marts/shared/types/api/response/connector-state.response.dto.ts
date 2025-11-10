export interface ConnectorStateItemResponseDto {
  _id: string;
  state: Record<string, unknown>;
  at: string;
}

export interface ConnectorStateResponseDto {
  state?: Record<string, unknown>;
  at?: string;
  states?: ConnectorStateItemResponseDto[];
}
