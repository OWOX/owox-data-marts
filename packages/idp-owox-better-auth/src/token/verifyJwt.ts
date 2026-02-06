import { jwtVerify, createLocalJWKSet } from 'jose';
import { JWKSNoMatchingKey, JWSSignatureVerificationFailed } from 'jose/errors';
import { JWTVerifyOptions } from 'jose/jwt/verify';

interface verifyConfig {
  algorithm: string;
  clockTolerance: string | number;
  issuer: string;
}

export async function verify(
  token: string,
  getKeyResolver: () => Promise<ReturnType<typeof createLocalJWKSet>>,
  refreshKeyResolver: () => Promise<ReturnType<typeof createLocalJWKSet>>,
  config: verifyConfig
) {
  const jwtVerifyOptions: JWTVerifyOptions = {
    algorithms: [config.algorithm],
    clockTolerance: config.clockTolerance,
    issuer: config.issuer,
  };

  try {
    const key = await getKeyResolver();
    return await jwtVerify(token, key, jwtVerifyOptions);
  } catch (err) {
    const shouldRefreshKey =
      err instanceof JWKSNoMatchingKey || err instanceof JWSSignatureVerificationFailed;
    if (!shouldRefreshKey) throw err;

    const keyAfterReload = await refreshKeyResolver();
    return await jwtVerify(token, keyAfterReload, jwtVerifyOptions);
  }
}
