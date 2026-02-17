import { MlsClient, KeyPackage } from './index';
import { IndexedDBStorage } from '../utils/storage';

export class KeyPackageManager {
  private keyPackages = new Map<string, KeyPackage>();
  private storage: IndexedDBStorage;

  constructor(private mlsClient: MlsClient, private deviceId: string) {
    this.storage = new IndexedDBStorage('mls-db', 'keypackages');
  }

  async init(): Promise<void> {
    await this.storage.init();
    await this.load();
  }

  generate(): KeyPackage {
    const kp = this.mlsClient.generateKeyPackage();
    this.keyPackages.set(this.deviceId, kp);
    this.store();
    return kp;
  }

  get(deviceId: string): KeyPackage | undefined {
    return this.keyPackages.get(deviceId);
  }

  // Store in IndexedDB
  private async store(): Promise<void> {
    const data = Object.fromEntries(this.keyPackages);
    await this.storage.set('keypackages', data);
  }

  private async load(): Promise<void> {
    const data = await this.storage.get('keypackages');
    if (data) {
      this.keyPackages = new Map(Object.entries(data));
    }
  }
}