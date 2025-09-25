export interface SqlValidationResponseDto {
  isValid: boolean;
  error: string | null;
  bytes?: number;
}
