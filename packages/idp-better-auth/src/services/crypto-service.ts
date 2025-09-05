import { createBetterAuthConfig } from '../auth/auth-config.js';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

export class CryptoServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoServiceError';
  }
}

export class CryptoService {
  private readonly secret: string;
  private readonly algorithm: jwt.Algorithm;
  private readonly expiresIn: number;
  private readonly aesAlgorithm: string;
  private readonly issuer: string;

  constructor(auth: Awaited<ReturnType<typeof createBetterAuthConfig>>) {
    this.secret = auth.options.secret || 'default-secret';
    this.algorithm = 'HS256';
    this.expiresIn = 3600;
    this.aesAlgorithm = 'aes-256-cbc';
    this.issuer = 'idp-better-auth';
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

      const payload = { payload: encryptedData };
      const options: SignOptions = {
        algorithm: this.algorithm,
        expiresIn: this.expiresIn,
        issuer: this.issuer,
      };

      const token = jwt.sign(payload, this.secret, options);

      return token;
    } catch (error) {
      throw new CryptoServiceError(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async decrypt(token: string): Promise<string> {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: [this.algorithm],
      }) as jwt.JwtPayload;

      if (!decoded || !decoded.exp || decoded.exp < Date.now() / 1000) {
        throw new CryptoServiceError('Token expired');
      }

      if (!decoded.payload || typeof decoded.payload !== 'string') {
        throw new CryptoServiceError('Invalid token payload - missing or invalid encrypted data');
      }

      if (decoded.iss !== this.issuer) {
        throw new CryptoServiceError('Invalid token issuer');
      }

      const decryptedData = await this.decryptData(decoded.payload);

      return decryptedData;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new CryptoServiceError(`Decryption failed: Invalid token: ${error.message}`);
      }
      if (error instanceof CryptoServiceError) {
        throw error;
      }
      throw new CryptoServiceError(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
