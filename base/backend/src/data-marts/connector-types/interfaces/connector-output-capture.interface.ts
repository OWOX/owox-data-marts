export interface ConnectorOutputCapture {
  logCapture: {
    onStdout: (message: string) => void;
    onStderr: (message: string) => void;
    passThrough: boolean;
  };
  onSpawn: (pid: number) => void;
}
