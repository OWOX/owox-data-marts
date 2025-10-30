import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import { CommonModule } from '../../../common/common.module';

// Core connector services
import { ConnectorService } from './connector.service';
import { ConnectorExecutionService } from './connector-execution.service';
import { ConnectorSecretService } from './connector-secret.service';
import { ConnectorProcessService } from './connector-process.service';

// Configuration factories
import { ConnectorConfigurationFactory } from './connector-configuration.factory';

// Storage config builders (Strategy Pattern)
import { StorageConfigFactory } from './storage-config-builders/storage-config.factory';
import { BigQueryStorageConfigBuilder } from './storage-config-builders/bigquery-storage-config.builder';
import { AthenaStorageConfigBuilder } from './storage-config-builders/athena-storage-config.builder';

// Connector message services
import { ConnectorOutputCaptureService } from '../../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageParserService } from '../../connector-types/connector-message/services/connector-message-parser.service';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';

/**
 * Connector providers for use in parent module
 */
export const connectorProviders = [
  // Core connector services
  ConnectorService,
  ConnectorExecutionService,
  ConnectorSecretService,
  ConnectorProcessService,

  // Configuration factories
  ConnectorConfigurationFactory,

  // Storage configuration builders (Strategy Pattern)
  StorageConfigFactory,
  BigQueryStorageConfigBuilder,
  AthenaStorageConfigBuilder,

  // Connector message handling
  ConnectorOutputCaptureService,
  ConnectorMessageParserService,
  ConnectorStateService,
];

/**
 * Module encapsulating all connector-related functionality
 *
 * This module includes:
 * - Connector execution and process management
 * - Configuration factories using Factory Pattern
 * - Storage configuration builders using Strategy Pattern
 * - Connector state and message handling
 * - Connector secrets management
 *
 * Architecture patterns:
 * - Strategy Pattern: Storage configuration builders
 * - Factory Pattern: Configuration creation
 * - Dependency Injection: All services are injectable
 *
 * Note: This module is designed to be used within DataMartsModule
 * and shares its dependencies (DataMartService, ConsumptionTrackingService, etc.)
 */
@Module({
  imports: [TypeOrmModule.forFeature([DataMartRun, ConnectorState]), CommonModule],
  providers: connectorProviders,
  exports: [
    // Export services that are used by other modules
    ConnectorService,
    ConnectorExecutionService,
    ConnectorSecretService,
  ],
})
export class ConnectorModule {}
