// src/utils/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndexedDBStorage } from './storage'

describe('IndexedDBStorage', () => {
  let storage: IndexedDBStorage

  beforeEach(() => {
    storage = new IndexedDBStorage('test-db', 'test-store')
    // Set up mocks for each test
    const mockIDBRequest = {
      onsuccess: null,
      onerror: null,
      result: null,
    }

    const mockIDBTransaction = {
      objectStore: vi.fn(() => ({
        put: vi.fn(() => {
          setTimeout(() => {
            if (mockIDBRequest.onsuccess) mockIDBRequest.onsuccess()
          }, 0)
          return mockIDBRequest
        }),
        get: vi.fn(() => {
          mockIDBRequest.result = 'value'
          setTimeout(() => {
            if (mockIDBRequest.onsuccess) mockIDBRequest.onsuccess()
          }, 0)
          return mockIDBRequest
        }),
        delete: vi.fn(() => {
          setTimeout(() => {
            if (mockIDBRequest.onsuccess) mockIDBRequest.onsuccess()
          }, 0)
          return mockIDBRequest
        }),
      })),
    }

    const mockIDBDatabase = {
      transaction: vi.fn(() => mockIDBTransaction),
      objectStoreNames: {
        contains: vi.fn(() => false),
      },
      createObjectStore: vi.fn(),
    }

    const mockIndexedDB = {
      open: vi.fn(() => {
        const req = {
          ...mockIDBRequest,
          result: mockIDBDatabase,
          onupgradeneeded: null,
        }
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess()
        }, 0)
        return req
      }),
    }

    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
      writable: true,
    })
  })

  it('should init the database', async () => {
    await storage.init()
    expect((window as any).indexedDB.open).toHaveBeenCalledWith('test-db', 1)
  })

  it('should set a value', async () => {
    await storage.init()
    await expect(storage.set('key', 'value')).resolves.toBeUndefined()
  })

  it('should get a value', async () => {
    await storage.init()
    const value = await storage.get('key')
    expect(value).toBe('value')
  })

  it('should delete a value', async () => {
    await storage.init()
    await expect(storage.delete('key')).resolves.toBeUndefined()
  })
})