import * as crypto from 'crypto';
import * as jose from 'jose';
import { IKeyService, IKeyStorage } from '../types/interfaces.js';
import { KeyPair } from '../types/types.js';
import { Algorithm } from '../types/enums.js';

export class KeyService implements IKeyService {
  private activeKeyPair?: KeyPair;
  private keyStore: Map<string, KeyPair> = new Map();

  constructor(
    private readonly storage?: IKeyStorage,
    private readonly algorithm: Algorithm = Algorithm.RS256
  ) {}

  async generateKeyPair(): Promise<KeyPair> {
    const kid = crypto.randomBytes(16).toString('hex');

    let publicKey: string;
    let privateKey: string;

    if (this.algorithm === Algorithm.RS256) {
      const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      publicKey = pubKey;
      privateKey = privKey;
    } else {
      const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      publicKey = pubKey;
      privateKey = privKey;
    }

    const keyPair: KeyPair = {
      publicKey,
      privateKey,
      kid,
      algorithm: this.algorithm,
      createdAt: new Date(),
    };

    this.keyStore.set(kid, keyPair);
    this.activeKeyPair = keyPair;

    if (this.storage) {
      await this.storage.saveKeyPair(keyPair);
    }

    return keyPair;
  }

  async signToken(payload: any): Promise<string> {
    const keyPair = await this.getActiveKeyPair();
    const privateKey = await jose.importPKCS8(keyPair.privateKey, keyPair.algorithm);

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: keyPair.algorithm,
        kid: keyPair.kid,
        typ: 'JWT',
      })
      .setIssuedAt()
      .sign(privateKey);

    return jwt;
  }

  async verifyToken(token: string): Promise<any> {
    const { kid } = jose.decodeProtectedHeader(token);

    if (!kid) {
      throw new Error('Token missing kid header');
    }

    const keyPair = this.keyStore.get(kid) || (await this.storage?.getKeyPair(kid)) || null;

    if (!keyPair) {
      throw new Error('Unknown key id');
    }

    const publicKey = await jose.importSPKI(keyPair.publicKey, keyPair.algorithm);

    const { payload } = await jose.jwtVerify(token, publicKey);
    return payload;
  }

  async getActiveKeyPair(): Promise<KeyPair> {
    if (!this.activeKeyPair) {
      // Try to load from storage
      if (this.storage) {
        this.activeKeyPair = (await this.storage.getActiveKeyPair()) || undefined;
      }

      // Generate new if none exists
      if (!this.activeKeyPair) {
        this.activeKeyPair = await this.generateKeyPair();
      }
    }

    return this.activeKeyPair;
  }

  async rotateKeys(): Promise<KeyPair> {
    // Keep old keys for verification of existing tokens
    const newKeyPair = await this.generateKeyPair();

    if (this.storage) {
      await this.storage.setActiveKeyPair(newKeyPair.kid);
    }
    return newKeyPair;
  }
}
