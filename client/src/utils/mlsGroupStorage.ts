// MLS Group persistence in IndexedDB
import type { MlsGroup } from '../mls/index';

const DB_NAME = 'MlsChatGroups';
const STORE_NAME = 'groups';
const STATE_STORE = 'wasm_state';
const SENT_MESSAGES_STORE = 'sent_messages';
const DB_VERSION = 4; // v4: added sent_messages store

export interface StoredMlsGroup extends MlsGroup {
  lastUpdated: number; // timestamp
}

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      // v1→v2: keyPath changed from 'groupId' to 'id' — drop and recreate
      // v2→v3: add wasm_state store
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
      if (oldVersion < 3) {
        // wasm_state store: one record per userId
        db.createObjectStore(STATE_STORE, { keyPath: 'userId' });
      }
      if (oldVersion < 4) {
        // sent_messages store: cache plaintext of sent messages so they can
        // be shown in history after reload (MLS senders can't decrypt own ciphertext)
        db.createObjectStore(SENT_MESSAGES_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save MLS group to IndexedDB (keyed by app UUID = group.id)
 */
export async function saveMlsGroup(group: MlsGroup): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const storedGroup: StoredMlsGroup = {
    ...group,
    lastUpdated: Date.now(),
  };

  store.put(storedGroup);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Load MLS group from IndexedDB by app UUID
 */
export async function loadMlsGroup(id: string): Promise<StoredMlsGroup | null> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.get(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all MLS groups from IndexedDB
 */
export async function loadAllMlsGroups(): Promise<StoredMlsGroup[]> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete MLS group from IndexedDB
 */
export async function deleteMlsGroup(id: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.delete(id);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Clear all MLS groups from IndexedDB
 */
export async function clearAllMlsGroups(): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Save the full WASM state JSON for a user (backend storage + signer).
 * Keyed by userId so multiple accounts on the same device are isolated.
 */
export async function saveWasmState(userId: string, stateJson: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STATE_STORE], 'readwrite');
  const store = transaction.objectStore(STATE_STORE);
  store.put({ userId, stateJson, lastUpdated: Date.now() });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Load the WASM state JSON for a user, or null if not found.
 */
export async function loadWasmState(userId: string): Promise<string | null> {
  const db = await openDB();
  const transaction = db.transaction([STATE_STORE], 'readonly');
  const store = transaction.objectStore(STATE_STORE);
  const request = store.get(userId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const record = request.result;
      resolve(record ? (record.stateJson as string) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete the WASM state for a user (e.g. on logout).
 */
export async function deleteWasmState(userId: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STATE_STORE], 'readwrite');
  const store = transaction.objectStore(STATE_STORE);
  store.delete(userId);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Cache plaintext of a sent message so it can be shown in history after reload.
 * Key: `${groupId}:${serverSeq}` — both fields come from the server ack.
 */
export async function saveSentMessage(
  groupId: string,
  serverSeq: number,
  text: string,
  senderId: string,
  deviceId: string,
  timestamp: number,
): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([SENT_MESSAGES_STORE], 'readwrite');
  const store = transaction.objectStore(SENT_MESSAGES_STORE);
  store.put({ id: `${groupId}:${serverSeq}`, groupId, serverSeq, text, senderId, deviceId, timestamp });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Look up a cached sent message by group and server sequence number.
 * Returns the plaintext string, or null if not cached.
 */
export async function getSentMessage(groupId: string, serverSeq: number): Promise<string | null> {
  const db = await openDB();
  const transaction = db.transaction([SENT_MESSAGES_STORE], 'readonly');
  const store = transaction.objectStore(SENT_MESSAGES_STORE);
  const request = store.get(`${groupId}:${serverSeq}`);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const record = request.result;
      resolve(record ? (record.text as string) : null);
    };
    request.onerror = () => reject(request.error);
  });
}
