// src/mls/keypackage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KeyPackageManager } from './keypackage'
import { MlsClient } from './index'

// Mock IndexedDBStorage
vi.mock('../utils/storage', () => ({
  IndexedDBStorage: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({}),
  })),
}))

// Mock MlsClient
vi.mock('./index', () => ({
  MlsClient: vi.fn().mockImplementation(() => ({
    generateKeyPackage: vi.fn(() => ({ data: 'dummy' })),
  })),
}))

describe('KeyPackageManager', () => {
  let mlsClient: MlsClient
  let manager: KeyPackageManager

  beforeEach(() => {
    mlsClient = new MlsClient(new Uint8Array(32), new Uint8Array(32))
    manager = new KeyPackageManager(mlsClient, 'device123')
  })

  it('should init and load key packages', async () => {
    await manager.init()
    expect(manager.get('device123')).toBeUndefined()
  })

  it('should generate a key package', () => {
    const kp = manager.generate()
    expect(kp).toEqual({ data: 'dummy' })
    expect(manager.get('device123')).toEqual(kp)
  })

  it('should get a key package', () => {
    manager.generate()
    const kp = manager.get('device123')
    expect(kp).toEqual({ data: 'dummy' })
  })
})