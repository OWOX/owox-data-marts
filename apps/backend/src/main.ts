import { IdpProtocolMiddleware, NullIdpProvider } from '@owox/idp-protocol';
import { bootstrap } from './bootstrap';
import express from 'express';
import { Logger } from '@nestjs/common';
import { loadEnv } from './load-env';

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
    app.set('trust proxy', 1);
    app.get('/api/flags', (_req, res) => {
      res.json({});
    });
    await setupIdp(app);

    await bootstrap({ express: app });
  } catch (e) {
    logger.error('Catch unhandled error', e);
    process.exit(1);
  }
}

void main();
