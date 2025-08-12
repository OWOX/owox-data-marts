import { IdpProtocolMiddleware, NullIdpProvider } from '@owox/idp-protocol';
import { bootstrap } from './bootstrap';
import express from 'express';

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
  try {
    const app = express();

    await setupIdp(app);

    await bootstrap({ express: app });
  } catch {
    process.exit(1);
  }
}

void main();
