// src/test/setup.ts
import { vi } from 'vitest'

// Mock WebAuthn API
Object.defineProperty(window, 'navigator', {
  value: {
    ...window.navigator,
    credentials: {
      create: vi.fn(),
      get: vi.fn(),
    },
  },
  writable: true,
})

// Mock IndexedDB
const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  result: null,
}

const mockIDBTransaction = {
  objectStore: vi.fn(() => ({
    put: vi.fn(() => mockIDBRequest),
    get: vi.fn(() => mockIDBRequest),
    delete: vi.fn(() => mockIDBRequest),
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
  open: vi.fn(() => ({
    ...mockIDBRequest,
    result: mockIDBDatabase,
    onupgradeneeded: null,
  })),
}

Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
})

// Mock WASM MLS if needed
vi.mock('../mls/wasm/pkg/mls_wasm.js', () => ({
  init: vi.fn(),
  create_group: vi.fn(),
  // Add other mocks as needed
}))