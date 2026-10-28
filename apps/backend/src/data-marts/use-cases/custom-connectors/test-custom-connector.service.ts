import { Injectable } from '@nestjs/common';
import type { TestCustomConnectorCommand } from '../../dto/domain/test-custom-connector.command';
import type { CustomConnectorTestResultDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorTestService } from '../../services/connector/connector-test.service';

@Injectable()
export class TestCustomConnectorService {
  constructor(private readonly tester: ConnectorTestService) {}

  run(command: TestCustomConnectorCommand): Promise<CustomConnectorTestResultDto> {
    return this.tester.runTest({ ...command.input, projectId: command.projectId });
  }
}
