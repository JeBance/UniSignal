const DB_NAME = 'unisignal-db';
const DB_VERSION = 1;
const SIGNALS_STORE = 'signals';

interface SignalDB {
  id: number;
  channel: string;
  direction: string | null;
  ticker: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  text: string;
  timestamp: number;
  parsedSignal?: Record<string, unknown> | null;
  createdAt: number;
}

let db: IDBDatabase | null = null;

// Открытие базы данных
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(SIGNALS_STORE)) {
        const store = database.createObjectStore(SIGNALS_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('channel', 'channel', { unique: false });
        store.createIndex('ticker', 'ticker', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

// Сохранение сигнала
export async function saveSignal(signal: SignalDB): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readwrite');
    const store = transaction.objectStore(SIGNALS_STORE);
    const request = store.put(signal);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Сохранение нескольких сигналов
export async function saveSignals(signals: SignalDB[]): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readwrite');
    const store = transaction.objectStore(SIGNALS_STORE);

    signals.forEach(signal => {
      store.put(signal);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Получение всех сигналов
export async function getAllSignals(): Promise<SignalDB[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const signals = request.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(signals);
    };
    request.onerror = () => reject(request.error);
  });
}

// Получение сигналов с пагинацией
export async function getSignals(limit: number = 100, offset: number = 0): Promise<SignalDB[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const signals = request.result
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(offset, offset + limit);
      resolve(signals);
    };
    request.onerror = () => reject(request.error);
  });
}

// Получение последнего timestamp
export async function getLastSignalTimestamp(): Promise<number> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        resolve(cursor.value.timestamp);
      } else {
        resolve(0);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Получение последнего ID
export async function getLastSignalId(): Promise<number> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const request = store.openCursor(null, 'prev');

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        resolve(cursor.value.id);
      } else {
        resolve(0);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Получение сигналов новее указанного timestamp
export async function getSignalsAfterTimestamp(timestamp: number): Promise<SignalDB[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const index = store.index('timestamp');
    const request = index.openCursor(IDBKeyRange.lowerBound(timestamp), 'next');
    const signals: SignalDB[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        signals.push(cursor.value);
        cursor.continue();
      } else {
        resolve(signals.sort((a, b) => b.timestamp - a.timestamp));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Удаление всех сигналов
export async function clearSignals(): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readwrite');
    const store = transaction.objectStore(SIGNALS_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Удаление старых сигналов (оставляем только последние N)
export async function pruneOldSignals(keepCount: number = 1000): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readwrite');
    const store = transaction.objectStore(SIGNALS_STORE);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const toDelete: number[] = [];
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        count++;
        if (count > keepCount) {
          toDelete.push(cursor.value.id);
          store.delete(cursor.value.id);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Конвертация сигнала из API в формат для IndexedDB
export function signalToDB(signal: any): SignalDB {
  return {
    id: signal.id,
    channel: signal.channel,
    direction: signal.direction,
    ticker: signal.ticker,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    text: signal.text,
    timestamp: signal.timestamp,
    parsedSignal: signal.parsedSignal,
    createdAt: Date.now(),
  };
}

// Удаление базы данных (полное)
export async function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      db = null;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Получение статистики базы данных
export async function getDBStats(): Promise<{ count: number; oldest?: number; newest?: number }> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SIGNALS_STORE], 'readonly');
    const store = transaction.objectStore(SIGNALS_STORE);
    const countRequest = store.count();
    const firstRequest = store.openCursor(null, 'next');
    const lastRequest = store.openCursor(null, 'prev');

    let oldest: number | undefined;
    let newest: number | undefined;

    firstRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) oldest = cursor.value.timestamp;
    };

    lastRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) newest = cursor.value.timestamp;
    };

    countRequest.onsuccess = () => {
      resolve({
        count: countRequest.result,
        oldest,
        newest,
      });
    };

    transaction.oncomplete = () => {
      resolve({
        count: countRequest.result,
        oldest,
        newest,
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}
