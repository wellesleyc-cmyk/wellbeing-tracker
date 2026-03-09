// db.js — IndexedDB wrapper for wellbeing-tracker
// All functions are Promise-based. No callbacks exposed to callers.

const DB_NAME = 'wellbeingDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let _db = null;

/**
 * Open/initialize the database. Call once on app start.
 * Subsequent calls return the already-opened connection.
 * @returns {Promise<IDBDatabase>}
 */
export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // keyPath is the date string "YYYY-MM-DD" — one entry per day
        db.createObjectStore(STORE_NAME, { keyPath: 'date' });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(new Error(`openDB failed: ${event.target.error}`));
    };

    request.onblocked = () => reject(new Error('openDB blocked: close other tabs with this app open'));
  });
}

/**
 * Save or update an entry (upsert by date key).
 * @param {Object} entry - Entry object with at minimum a `date` field.
 * @returns {Promise<void>}
 */
export async function saveEntry(entry) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry); // put = insert or replace

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(new Error(`saveEntry failed: ${event.target.error}`));
    tx.onabort = (event) => reject(new Error(`saveEntry aborted: ${event.target.error}`));
  });
}

/**
 * Get a single entry by date string "YYYY-MM-DD".
 * @param {string} date - Date string in "YYYY-MM-DD" format.
 * @returns {Promise<Object|null>} The entry object, or null if not found.
 */
export async function getEntry(date) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(date);

    request.onsuccess = (event) => {
      resolve(event.target.result ?? null);
    };
    request.onerror = (event) => {
      reject(new Error(`getEntry failed: ${event.target.error}`));
    };
  });
}

/**
 * Get all entries sorted by date ascending.
 * @returns {Promise<Object[]>} Array of entry objects ordered oldest-first.
 */
export async function getAllEntries() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      const entries = event.target.result ?? [];
      // keyPath is a date string, lexicographic sort == chronological sort
      entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      resolve(entries);
    };
    request.onerror = (event) => {
      reject(new Error(`getAllEntries failed: ${event.target.error}`));
    };
  });
}

/**
 * Delete an entry by date (used in the edit flow to replace an entry).
 * Resolves silently if the key does not exist.
 * @param {string} date - Date string in "YYYY-MM-DD" format.
 * @returns {Promise<void>}
 */
export async function deleteEntry(date) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(date);

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(new Error(`deleteEntry failed: ${event.target.error}`));
    tx.onabort = (event) => reject(new Error(`deleteEntry aborted: ${event.target.error}`));
  });
}
