import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authedFetch, useAuth } from "./auth";
import { API_URL } from "./config";

const ANON_SCOPE = "anon";
const historyKeyFor = (scope: string) => `search_history:${scope}`;
const MAX_ITEMS = 20;

interface SearchHistoryContextValue {
  loaded: boolean;
  terms: string[];
  addTerm: (term: string) => void;
  removeTerm: (term: string) => void;
  clearAll: () => void;
  syncFromServer: () => Promise<void>;
}

const SearchHistoryContext = createContext<SearchHistoryContextValue | null>(null);

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [terms, setTerms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const termsRef = useRef<string[]>([]);
  const scopeRef = useRef<string>(ANON_SCOPE);
  const epochRef = useRef(0);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(async (next: string[]) => {
    termsRef.current = next;
    setTerms(next);
    await AsyncStorage.setItem(historyKeyFor(scopeRef.current), JSON.stringify(next));
  }, []);

  const loadScope = useCallback(async (scope: string) => {
    const epoch = ++epochRef.current;
    try {
      const raw = await AsyncStorage.getItem(historyKeyFor(scope));
      const p = raw ? JSON.parse(raw) : [];
      if (epochRef.current !== epoch) return epoch;
      termsRef.current = p;
      setTerms(p);
    } finally {
      setLoaded(true);
    }
    return epoch;
  }, []);

  // 首次加载：本地作用域的缓存（登录状态可能未就绪，由身份切换登录接手）
  useEffect(() => {
    loadScope(ANON_SCOPE);
  }, [loadScope]);

  // 登录后拉取服务器搜索历史并合并（本地优先，服务器补充），再推回合并结果。
  // extraTerms：匿名 -> 登录时传入的匿名本地历史，一并并入该账号。
  const syncFromServer = useCallback(
    async (extraTerms?: string[]) => {
      try {
        const res = await authedFetch(`${API_URL}/me/`);
        if (!res.ok) return;
        const me = await res.json();
        const serverTerms: string[] = me.search_history ?? [];
        const merged = Array.from(
          new Set([...(extraTerms ?? []), ...termsRef.current, ...serverTerms]),
        );
        await persist(merged.slice(0, MAX_ITEMS));
        syncChainRef.current = syncChainRef.current.then(async () => {
          await authedFetch(`${API_URL}/me/search-history/`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ terms: termsRef.current.slice(0, MAX_ITEMS) }),
          }).catch(() => {});
        });
      } catch {
        // 静默失败，保留本地
      }
    },
    [persist],
  );

  // 身份切换：匿名<->用户、用户间登录，隔离各自本地缓存
  useEffect(() => {
    if (!auth.loaded) return;
    const scope = auth.user?.email ?? ANON_SCOPE;
    const prev = scopeRef.current;
    if (scope === prev) return;

    scopeRef.current = scope;

    (async () => {
      if (scope !== ANON_SCOPE && prev === ANON_SCOPE) {
        // 匿名 -> 登录：把匿名本地历史合并进该账号（保留当前功能），再清理匿名缓存
        const anonTerms = termsRef.current;
        const epoch = await loadScope(scope);
        if (epochRef.current !== epoch) return;
        await syncFromServer(anonTerms);
        AsyncStorage.removeItem(historyKeyFor(ANON_SCOPE)).catch(() => {});
        return;
      }

      // 登出（-> 匿名）或切换账号：加载该作用域自己的缓存，丢弃上一用户本地数据
      const epoch = await loadScope(scope);
      if (epochRef.current !== epoch) return;
      if (scope !== ANON_SCOPE) {
        await syncFromServer();
      }
    })();
  }, [auth.loaded, auth.user, syncFromServer, loadScope]);

  const pushToServer = useCallback(
    async (next: string[]) => {
      if (!auth.user) return;
      syncChainRef.current = syncChainRef.current.then(async () => {
        await authedFetch(`${API_URL}/me/search-history/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms: next }),
        }).catch(() => {});
      });
    },
    [auth.user],
  );

  const addTerm = useCallback(
    (term: string) => {
      const t = String(term ?? "").trim();
      if (!t) return;
      const next = [t, ...termsRef.current.filter((x) => x !== t)].slice(0, MAX_ITEMS);
      persist(next);
      pushToServer(next);
    },
    [persist, pushToServer],
  );

  const removeTerm = useCallback(
    (term: string) => {
      const next = termsRef.current.filter((x) => x !== term);
      persist(next);
      pushToServer(next);
    },
    [persist, pushToServer],
  );

  const clearAll = useCallback(() => {
    persist([]);
    pushToServer([]);
  }, [persist, pushToServer]);

  const value = useMemo<SearchHistoryContextValue>(
    () => ({ loaded, terms, addTerm, removeTerm, clearAll, syncFromServer }),
    [loaded, terms, addTerm, removeTerm, clearAll, syncFromServer],
  );

  return (
    <SearchHistoryContext.Provider value={value}>{children}</SearchHistoryContext.Provider>
  );
}

export function useSearchHistory(): SearchHistoryContextValue {
  const ctx = useContext(SearchHistoryContext);
  if (!ctx) {
    throw new Error("useSearchHistory must be used within SearchHistoryProvider");
  }
  return ctx;
}