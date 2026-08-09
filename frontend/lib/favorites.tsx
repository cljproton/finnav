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
import type { Site } from "./types";

const ANON_SCOPE = "anon";
const keysFor = (scope: string) => ({
  ids: `favorites:${scope}`,
  snap: `favorites_snap:${scope}`,
});

interface FavoritesContextValue {
  loaded: boolean;
  ids: number[];
  favoriteSites: Site[];
  isFavorite: (id: number) => boolean;
  toggle: (site: Site) => void;
  syncFromServer: () => Promise<void>;
  pruneMissing: (validIds: number[]) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [ids, setIds] = useState<number[]>([]);
  const [snapshots, setSnapshots] = useState<Record<number, Site>>({});
  const [loaded, setLoaded] = useState(false);
  const idsRef = useRef<number[]>([]);
  const snapRef = useRef<Record<number, Site>>({});
  const scopeRef = useRef<string>(ANON_SCOPE);

  const scopeKey = (scope: string) => keysFor(scope);

  const persist = useCallback(async (nextIds: number[], nextSnap: Record<number, Site>) => {
    idsRef.current = nextIds;
    snapRef.current = nextSnap;
    setIds(nextIds);
    setSnapshots(nextSnap);
    const { ids: kId, snap: kSnap } = scopeKey(scopeRef.current);
    await Promise.all([
      AsyncStorage.setItem(kId, JSON.stringify(nextIds)),
      AsyncStorage.setItem(kSnap, JSON.stringify(nextSnap)),
    ]);
  }, []);

  const loadScope = useCallback(async (scope: string) => {
    const { ids: kId, snap: kSnap } = scopeKey(scope);
    try {
      const [rawIds, rawSnap] = await Promise.all([
        AsyncStorage.getItem(kId),
        AsyncStorage.getItem(kSnap),
      ]);
      const pIds = rawIds ? JSON.parse(rawIds) : [];
      const pSnap = rawSnap ? JSON.parse(rawSnap) : {};
      idsRef.current = pIds;
      snapRef.current = pSnap;
      setIds(pIds);
      setSnapshots(pSnap);
    } finally {
      setLoaded(true);
    }
  }, []);

  // 首次加载匿名作用域的本地缓存（登录状态可能尚未就绪，由身份切换 effect 接手）
  useEffect(() => {
    loadScope(ANON_SCOPE);
  }, [loadScope]);

  // 登录后把服务器收藏拉下来合并，再把合并结果推回服务器（双向同步）
  const syncFromServer = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_URL}/me/`);
      if (!res.ok) return;
      const me = await res.json();
      const serverSites: Site[] = me.favorites ?? [];
      const merged = Array.from(new Set([...idsRef.current, ...serverSites.map((s) => s.id)]));
      const snap = { ...snapRef.current };
      for (const s of serverSites) {
        snap[s.id] = s; // 服务器数据为权威
      }
      await persist(merged, snap);
      await authedFetch(`${API_URL}/me/favorites/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_ids: merged }),
      });
    } catch {
      // 同步失败时静默，保留本地数据
    }
  }, [persist]);

  // 身份切换：匿名<->用户、或换用户登录，隔离各自本地缓存
  useEffect(() => {
    if (!auth.loaded) return;
    const scope = auth.user?.email ?? ANON_SCOPE;
    const prev = scopeRef.current;
    if (scope === prev) return;

    scopeRef.current = scope;

    if (scope !== ANON_SCOPE && prev === ANON_SCOPE) {
      // 匿名 -> 登录：把匿名本地收藏合并进该账号（保留合并功能），再清理匿名缓存
      syncFromServer();
      const { ids: kId, snap: kSnap } = scopeKey(ANON_SCOPE);
      Promise.all([AsyncStorage.removeItem(kId), AsyncStorage.removeItem(kSnap)]).catch(
        () => {},
      );
      return;
    }

    // 登出（-> 匿名）或切换账号：加载该作用域自己的缓存，不合并上一用户的本地数据
    loadScope(scope);
    if (scope !== ANON_SCOPE) {
      syncFromServer();
    }
  }, [auth.loaded, auth.user, syncFromServer, loadScope]);

  const toggle = useCallback(
    (site: Site) => {
      const isFav = idsRef.current.includes(site.id);
      const next = isFav
        ? idsRef.current.filter((i) => i !== site.id)
        : [...idsRef.current, site.id];
      const nextSnap = { ...snapRef.current };
      if (isFav) {
        delete nextSnap[site.id];
      } else {
        nextSnap[site.id] = site;
      }
      persist(next, nextSnap);
      if (auth.user) {
        authedFetch(`${API_URL}/me/favorites/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_ids: next }),
        }).catch(() => {});
      }
    },
    [persist, auth.user],
  );

  const isFavorite = useCallback((id: number) => ids.includes(id), [ids]);

  // 从本地收藏中剔除已不存在的站点（如后台已删除），保持列表与服务器一致
  const pruneMissing = useCallback(
    (validIds: number[]) => {
      const valid = new Set(validIds);
      const next = idsRef.current.filter((id) => valid.has(id));
      if (next.length === idsRef.current.length) return;
      const nextSnap = { ...snapRef.current };
      for (const id of Object.keys(nextSnap)) {
        if (!valid.has(Number(id))) delete nextSnap[Number(id)];
      }
      persist(next, nextSnap);
    },
    [persist],
  );

  const favoriteSites = useMemo(
    () => ids.map((id) => snapshots[id]).filter(Boolean) as Site[],
    [ids, snapshots],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      loaded,
      ids,
      favoriteSites,
      isFavorite,
      toggle,
      syncFromServer,
      pruneMissing,
    }),
    [loaded, ids, favoriteSites, isFavorite, toggle, syncFromServer, pruneMissing],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}