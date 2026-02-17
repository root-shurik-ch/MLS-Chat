import { MlsClient, KeyPackage } from './index';

export class KeyPackageManager {
  private keyPackages = new Map<string, KeyPackage>();

  constructor(private mlsClient: MlsClient, private deviceId: string) {}

  generate(): KeyPackage {
    const kp = this.mlsClient.generateKeyPackage();
    this.keyPackages.set(this.deviceId, kp);
    return kp;
  }

  get(deviceId: string): KeyPackage | undefined {
    return this.keyPackages.get(deviceId);
  }

  // Store in IndexedDB
  async store(): Promise<void> {
    // IndexedDB logic
  }

  async load(): Promise<void> {
    // Load from IndexedDB
  }
}