import { Injectable } from '@nestjs/common';
import { SetupDiscoveryService } from '../use-cases/setup-discovery.service';
import type {
  McpSetupDiscoveryFacade,
  SetupStorageRequest,
  SetupResourcesRequest,
  SetupConnectorRequest,
  SetupRequirementsRequest,
} from './mcp-setup-discovery.facade';
@Injectable()
export class McpSetupDiscoveryFacadeImpl implements McpSetupDiscoveryFacade {
  constructor(private readonly discovery: SetupDiscoveryService) {}
  listStorages(request: SetupStorageRequest) {
    return this.discovery.listStorages(request);
  }
  listStorageResources(request: SetupResourcesRequest) {
    return this.discovery.listStorageResources(request);
  }
  listConnectors(request: SetupConnectorRequest) {
    return this.discovery.listConnectors(request);
  }
  getConnectorRequirements(request: SetupRequirementsRequest) {
    return this.discovery.getConnectorRequirements(request);
  }
}
