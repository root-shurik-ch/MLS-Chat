// Key Manager for secure MLS key storage and retrieval
// Uses IndexedDB for secure storage, never localStorage for private keys

import { IndexedDBStorage } from './storage';
import { deriveKEnc, decryptMlsPrivateKey } from './crypto';
import { getPrfOutput } from './webauthn';

export interface StoredKeys {
  mlsPrivateKey: Uint8Array;
  mlsPublicKey: Uint8Array;
  userId: string;
  deviceId: string;
}

export class KeyManager {
  private keyStorage: IndexedDBStorage;
  private groupStorage: IndexedDBStorage;

  constructor() {
    this.keyStorage = new IndexedDBStorage('mls-keys', 'keys');
    this.groupStorage = new IndexedDBStorage('mls-groups', 'groups');
  }

  async init(): Promise<void> {
    await this.keyStorage.init();
    await this.groupStorage.init();
  }

  // Store keys after registration/login
  async storeKeys(
    userId: string,
    deviceId: string,
    mlsPrivateKey: Uint8Array,
    mlsPublicKey: Uint8Array,
    kEnc: CryptoKey
  ): Promise<void> {
    const privateKeyStr = btoa(String.fromCharCode(...mlsPrivateKey));
    const publicKeyStr = btoa(String.fromCharCode(...mlsPublicKey));
    
    await this.keyStorage.set(`mlsPrivateKey_${userId}_${deviceId}`, privateKeyStr);
    await this.keyStorage.set(`mlsPublicKey_${userId}_${deviceId}`, publicKeyStr);
    await this.keyStorage.set(`kEnc_${userId}_${deviceId}`, kEnc);
    await this.keyStorage.set(`userId_${deviceId}`, userId);
  }

  // Retrieve keys for MLS operations
  async getKeys(userId: string, deviceId: string): Promise<StoredKeys> {
    const privateKeyStr = await this.keyStorage.get(`mlsPrivateKey_${userId}_${deviceId}`);
    const publicKeyStr = await this.keyStorage.get(`mlsPublicKey_${userId}_${deviceId}`);
    
    if (!privateKeyStr || !publicKeyStr) {
      throw new Error('MLS keys not found. Please log in again.');
    }

    const mlsPrivateKey = Uint8Array.from(atob(privateKeyStr), c => c.charCodeAt(0));
    const mlsPublicKey = Uint8Array.from(atob(publicKeyStr), c => c.charCodeAt(0));

    return {
      mlsPrivateKey,
      mlsPublicKey,
      userId,
      deviceId
    };
  }

  // Decrypt encrypted MLS private key from server (during login)
  async decryptAndStoreServerKey(
    encryptedKey: string,
    userId: string,
    deviceId: string,
    credentialId: string
  ): Promise<void> {
    // Get PRF output from WebAuthn
    const prfOutput = await getPrfOutput(credentialId, userId);
    const kEnc = await deriveKEnc(prfOutput);
    
    // Decrypt the MLS private key
    const mlsPrivateKey = await decryptMlsPrivateKey(encryptedKey, kEnc, userId);
    
    // We need the MLS public key - for now, derive from private (mock)
    // In real implementation, server should return mlsPublicKey
    const mlsPublicKey = await this.derivePublicKey(mlsPrivateKey);
    
    await this.storeKeys(userId, deviceId, mlsPrivateKey, mlsPublicKey, kEnc);
  }

  // Mock public key derivation (replace with real MLS)
  private async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    // In real MLS, there's a proper keypair relationship
    // For now, mock with SHA-256 of private key
    const hash = await crypto.subtle.digest('SHA-256', privateKey);
    return new Uint8Array(hash);
  }

  // Clear all keys (logout)
  async clearKeys(userId: string, deviceId: string): Promise<void> {
    await this.keyStorage.delete(`mlsPrivateKey_${userId}_${deviceId}`);
    await this.keyStorage.delete(`mlsPublicKey_${userId}_${deviceId}`);
    await this.keyStorage.delete(`kEnc_${userId}_${deviceId}`);
    await this.keyStorage.delete(`userId_${deviceId}`);
  }

  // Check if keys exist
  async hasKeys(userId: string, deviceId: string): Promise<boolean> {
    try {
      const privateKeyStr = await this.keyStorage.get(`mlsPrivateKey_${userId}_${deviceId}`);
      return !!privateKeyStr;
    } catch {
      return false;
    }
  }
}