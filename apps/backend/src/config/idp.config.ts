import { NestExpressApplication } from '@nestjs/platform-express';
import { BetterAuthProvider } from '@owox/idp-better-auth';
import { NextFunction, Request, Response } from 'express';
import { IIdpProvider } from '@owox/idp-protocol';

async function createBetterAuthProvider(): Promise<IIdpProvider> {
  const config = {
    database: {
      type: 'sqlite',
      filename: './better-auth.db',
    },
    magicLink: {
      sendMagicLink: (_email: string, _token: string) => {},
    },
  };
  return await BetterAuthProvider.create(config);
}

async function providerFactory(): Promise<IIdpProvider | null> {
  const providerType = process.env.IDP_PROVIDER || 'better-auth';
  switch (providerType) {
    case 'better-auth':
      return await createBetterAuthProvider();
    case 'none':
      return null;
    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
}

export async function setupIdp(app: NestExpressApplication) {
  const idp = await providerFactory();

  if (idp === null) {
    // No IDP provider - skip authentication middleware
    return;
  }

  await idp.initialize();
  app.set('idp', idp);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await idp.verifyRequest(req);
      next();
    } catch {
      res.redirect((await idp.getRouter().getSignIn()).path);
    }
  });
}
