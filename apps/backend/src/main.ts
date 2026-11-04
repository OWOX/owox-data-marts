import { IdpProtocolMiddleware, NullIdpProvider } from '@owox/idp-protocol';
import { bootstrap } from './bootstrap';
import express from 'express';
import { Logger } from '@nestjs/common';
import { loadEnv } from './load-env';
import { isOwoxStorageEnabled } from './data-marts/owox-storage/owox-storage-settings';
import { registerPluginCollectionsBodyParser } from './config/plugin-collections-body-parser.config';
import { configureTrustProxy } from './config/trust-proxy.config';

async function setupIdp(app: express.Express) {
  const idpProvider = new NullIdpProvider();
  await idpProvider.initialize();
  app.set('idp', idpProvider);
  const idpProtocolMiddleware = new IdpProtocolMiddleware(idpProvider);
  idpProtocolMiddleware.register(app);
}

/**
 * Main function to bootstrap the application in standalone mode.
 */
export async function main() {
  const logger = new Logger('Bootstrap::main');
  loadEnv();
  try {
    const app = express();
    registerPluginCollectionsBodyParser(app);
    configureTrustProxy(app);
    // Read before routing so a partial configuration fails startup, not the flags call.
    const owoxStorageEnabled = String(isOwoxStorageEnabled(process.env));
    app.get('/api/flags', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        LICENSE_ISSUANCE_ENABLED: process.env.LICENSE_ISSUANCE_ENABLED,
        OWOX_STORAGE_ENABLED: owoxStorageEnabled,
      });
    });
    await setupIdp(app);

    await bootstrap({ express: app });
  } catch (e) {
    logger.error('Catch unhandled error', e);
    process.exit(1);
  }
}

void main();
