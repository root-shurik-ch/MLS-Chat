// Key Manager for secure MLS key storage and retrieval
// Uses IndexedDB for secure storage, never localStorage for private keys

import { IndexedDBStorage } from './storage';

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
  ): Promise<void> {
    const privateKeyStr = btoa(String.fromCharCode(...mlsPrivateKey));
    const publicKeyStr = btoa(String.fromCharCode(...mlsPublicKey));

    await this.keyStorage.set(`mlsPrivateKey_${userId}_${deviceId}`, privateKeyStr);
    await this.keyStorage.set(`mlsPublicKey_${userId}_${deviceId}`, publicKeyStr);
    await this.keyStorage.set(`userId_${deviceId}`, userId);
    // kWasm and kMsgCache are derived separately and stored via storeKWasmState / storeKMsgCache
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

  /** Store the WASM-state encryption key derived from passkey PRF. */
  async storeKWasmState(userId: string, kWasm: CryptoKey): Promise<void> {
    await this.keyStorage.set(`kWasm_${userId}`, kWasm);
  }

  /** Retrieve the WASM-state encryption key derived from passkey PRF. */
  async getKWasmState(userId: string): Promise<CryptoKey | null> {
    return (await this.keyStorage.get(`kWasm_${userId}`)) as CryptoKey | null;
  }

  /** Store the message-cache encryption key derived from passkey PRF. */
  async storeKMsgCache(userId: string, kMsgCache: CryptoKey): Promise<void> {
    await this.keyStorage.set(`kMsgCache_${userId}`, kMsgCache);
  }

  /** Retrieve the message-cache encryption key derived from passkey PRF. */
  async getKMsgCache(userId: string): Promise<CryptoKey | null> {
    return (await this.keyStorage.get(`kMsgCache_${userId}`)) as CryptoKey | null;
  }

  // Clear all keys (logout)
  async clearKeys(userId: string, deviceId: string): Promise<void> {
    await this.keyStorage.delete(`mlsPrivateKey_${userId}_${deviceId}`);
    await this.keyStorage.delete(`mlsPublicKey_${userId}_${deviceId}`);
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