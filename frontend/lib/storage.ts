const isBrowser = typeof window !== "undefined";

function safeJsonParse<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getItem<T = unknown>(key: string): Promise<T | null> {
  if (!isBrowser) return null;
  try {
    const val = localStorage.getItem(key);
    return safeJsonParse<T>(val);
  } catch {
    return null;
  }
}

async function setItem<T = unknown>(key: string, value: T): Promise<void> {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

async function removeItem(key: string): Promise<void> {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function clear(): Promise<void> {
  if (!isBrowser) return;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
}

export const storage = { getItem, setItem, removeItem, clear } as const;
export type Storage = typeof storage;
