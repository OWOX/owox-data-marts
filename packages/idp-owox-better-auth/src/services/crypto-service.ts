import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { promisify } from 'util';
import { createBetterAuthConfig } from '../config/idp-better-auth-config.js';

export class CryptoServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoServiceError';
  }
}

export class CryptoService {
  private readonly secret: string;
  private readonly expiresIn: number;
  private readonly aesAlgorithm: string;
  private readonly issuer: string;
  private readonly secretKey: Uint8Array;

  constructor(auth: Awaited<ReturnType<typeof createBetterAuthConfig>>) {
    this.secret = auth.options.secret || 'default-secret';
    this.expiresIn = 3600;
    this.aesAlgorithm = 'aes-256-cbc';
    this.issuer = 'idp-owox-better-auth';
    this.secretKey = new TextEncoder().encode(this.secret);
  }

  private async deriveKey(salt: Buffer): Promise<Buffer> {
    const scryptAsync = promisify(scrypt);
    return scryptAsync(this.secret, salt, 32) as Promise<Buffer>;
  }

  private async encryptData(data: string): Promise<string> {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    const key = await this.deriveKey(salt);

    const cipher = createCipheriv(this.aesAlgorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
    return Buffer.from(result).toString('base64');
  }

  private async decryptData(encryptedData: string): Promise<string> {
    const data = Buffer.from(encryptedData, 'base64').toString('utf8');
    const parts = data.split(':');

    if (parts.length !== 3) {
      throw new CryptoServiceError('Invalid encrypted data format');
    }

    const saltHex = parts[0];
    const ivHex = parts[1];
    const encrypted = parts[2];

    if (!saltHex || !ivHex || !encrypted) {
      throw new CryptoServiceError('Invalid encrypted data format - missing components');
    }

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    const key = await this.deriveKey(salt);

    const decipher = createDecipheriv(this.aesAlgorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async encrypt(data: string): Promise<string> {
    try {
      const encryptedData = await this.encryptData(data);

      const token = await new SignJWT({ payload: encryptedData })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(this.issuer)
        .setExpirationTime(`${this.expiresIn}s`)
        .sign(this.secretKey);

      return token;
    } catch (error) {
      throw new CryptoServiceError(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async decrypt(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.issuer,
        algorithms: ['HS256'],
      });

      if (!payload || typeof (payload as { payload?: unknown }).payload !== 'string') {
        throw new CryptoServiceError('Invalid token payload - missing or invalid encrypted data');
      }

      const decryptedData = await this.decryptData((payload as { payload: string }).payload);

      return decryptedData;
    } catch (error) {
      if (error instanceof CryptoServiceError) {
        throw error;
      }
      throw new CryptoServiceError(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
