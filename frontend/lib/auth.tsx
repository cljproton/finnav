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
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";
import i18n, { getAcceptLanguage } from "./i18n";
import { clearPendingReferral, getPendingReferral } from "./referral";

const TOKEN_KEY = "auth_token";
const EMAIL_KEY = "auth_email";

interface AuthUser {
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loaded: boolean;
}

export interface AuthContextValue extends AuthState {
  register: (email: string, password: string, captcha?: CaptchaPayload) => Promise<boolean>;
  verify: (email: string, code: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  login: (
    email: string,
    password: string,
    captcha?: CaptchaPayload,
  ) => Promise<LoginResult>;
  loginTFA: (email: string, totpToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export type LoginResult =
  | { needsTfa: false }
  | { needsTfa: true; totpToken: string };

export interface CaptchaPayload {
  token: string;
  answer: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loaded: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const [token, email] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(EMAIL_KEY),
        ]);
        if (token && email) {
          setState({ user: { email }, token, loaded: true });
          return;
        }
      } catch {
        // ignore
      }
      setState((s) => ({ ...s, loaded: true }));
    })();
  }, []);

  // 同步模块级 token，保证 authedFetch 全局可用
  useEffect(() => {
    setAuthToken(state.token);
  }, [state.token]);

  // 站点详情/列表含登录可见字段（本站缓存地址、SHA-256）；登录态变化（登录/恢复/退出）
  // 时让 react-query 缓存失效并重新带鉴权拉取，避免「已登录仍拿到匿名数据」或登出后残留。
  const queryClient = useQueryClient();
  const prevTokenRef = useRef(state.token);
  useEffect(() => {
    const prev = prevTokenRef.current;
    if (prev === state.token) return;
    prevTokenRef.current = state.token;
    const keys = [
      ["site"],
      ["sites"],
      ["site-reviews"],
      ["site-invite"],
      ["site-tutorials"],
      ["site-tutorials-top"],
      ["site-experiences"],
      ["my-app-links"],
      ["me-points"],
      ["me-points-transactions"],
      ["site-submissions"],
    ];
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }, [state.token, queryClient]);

  const register = useCallback(
    async (email: string, password: string, captcha?: CaptchaPayload) => {
      const referralCode = await getPendingReferral();
      const res = await fetch(`${API_URL}/auth/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getAcceptLanguage(),
        },
        body: JSON.stringify({
          email,
          password,
          captcha_token: captcha?.token,
          captcha_answer: captcha?.answer,
          referral_code: referralCode || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
      const data = await res.json().catch(() => ({}));
      // 后台关闭邮箱验证时，注册接口直接创建用户并返回令牌
      if (data.access) {
        await clearPendingReferral();
        await Promise.all([
          AsyncStorage.setItem(TOKEN_KEY, data.access),
          AsyncStorage.setItem(EMAIL_KEY, email),
        ]);
        setState({ user: { email }, token: data.access, loaded: true });
        return true;
      }
      // 需要邮件验证码：仅发送验证码，返回需走 verify 步骤
      return false;
    },
    [],
  );

  const verify = useCallback(
    async (email: string, code: string, password: string) => {
      const referralCode = await getPendingReferral();
      const res = await fetch(`${API_URL}/auth/verify/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getAcceptLanguage(),
        },
        body: JSON.stringify({
          email,
          code,
          password,
          referral_code: referralCode || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
      const data: { access: string; refresh: string } = await res.json();
      await clearPendingReferral();
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, data.access),
        AsyncStorage.setItem(EMAIL_KEY, email),
      ]);
      setState({ user: { email }, token: data.access, loaded: true });
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const res = await fetch(`${API_URL}/auth/password-reset/request/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": getAcceptLanguage(),
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/password-reset/confirm/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getAcceptLanguage(),
        },
        body: JSON.stringify({ email, code, password }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string, captcha?: CaptchaPayload) => {
      const res = await fetch(`${API_URL}/auth/token/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getAcceptLanguage(),
        },
        body: JSON.stringify({
          email,
          password,
          captcha_token: captcha?.token,
          captcha_answer: captcha?.answer,
        }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
      let data: any;
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      // 启用 2FA 的用户登录需二次验证：返回 code=TOTP_REQUIRED + totp_token
      if (data?.code === "TOTP_REQUIRED" && data?.totp_token) {
        const res: LoginResult = {
          needsTfa: true,
          totpToken: data.totp_token as string,
        };
        return res;
      }
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, data.access),
        AsyncStorage.setItem(EMAIL_KEY, email),
      ]);
      setState({ user: { email }, token: data.access, loaded: true });
      const noTfa: LoginResult = { needsTfa: false };
      return noTfa;
    },
    [],
  );

  const loginTFA = useCallback(
    async (email: string, totpToken: string, code: string) => {
      const res = await fetch(`${API_URL}/auth/twofa/challenge/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getAcceptLanguage(),
        },
        body: JSON.stringify({ totp_token: totpToken, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          String(body?.code || body?.detail || i18n.t("二次验证失败")),
        );
      }
      const data: { access: string; refresh: string } = await res.json();
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, data.access),
        AsyncStorage.setItem(EMAIL_KEY, email),
      ]);
      setState({ user: { email }, token: data.access, loaded: true });
    },
    [],
  );

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(EMAIL_KEY),
    ]);
    setState({ user: null, token: null, loaded: true });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      register,
      verify,
      requestPasswordReset,
      resetPassword,
      login,
      loginTFA,
      logout,
    }),
    [state, register, verify, requestPasswordReset, resetPassword, login, loginTFA, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

async function extractError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body !== "object" || body === null) {
    return i18n.t("请求失败 ({{status}})", { status: res.status });
  }
  if (typeof body.detail === "string") {
    return body.detail;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (body.errors) {
    return String(body.errors);
  }
  // DRF 校验错误：{ field: ["msg", ...] }、{ field: "msg" } 或 { non_field_errors: [...] }
  for (const values of Object.values(body)) {
    if (typeof values === "string") {
      return values;
    }
    if (Array.isArray(values) && values.length) {
      const first = values[0];
      return typeof first === "string" ? first : String(first);
    }
  }
  return i18n.t("请求失败 ({{status}})", { status: res.status });
}

let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
}

export function getAuthToken(): string | null {
  return currentToken;
}

export async function authedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // currentToken 是模块级缓存，可能在初次加载/并发后被清空；缺失时从存储回退读取，
  // 避免发出无 Authorization 的请求而命中 401「身份认证信息未提供」。
  let token = currentToken;
  if (!token) {
    try {
      token = await AsyncStorage.getItem(TOKEN_KEY);
      currentToken = token;
    } catch {
      token = null;
    }
  }
  const headers = new Headers(options.headers);
  headers.set("Accept-Language", getAcceptLanguage());
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // 仅在确实携带了校验令牌时才清除，避免因本地无令牌而误删已登录状态
    if (token) {
      currentToken = null;
      await Promise.all([
        AsyncStorage.removeItem(TOKEN_KEY),
        AsyncStorage.removeItem(EMAIL_KEY),
      ]);
    }
  }
  return res;
}
