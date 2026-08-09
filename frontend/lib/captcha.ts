import { API_URL } from "./config";
import i18n, { withLanguageHeaders } from "./i18n";
import type { CaptchaPayload } from "./auth";

export interface CaptchaData extends CaptchaPayload {
  image: string;
}

export async function fetchCaptcha(): Promise<CaptchaData> {
  const res = await fetch(`${API_URL}/auth/captcha/`, {
    headers: withLanguageHeaders(),
  });
  if (!res.ok) throw new Error(i18n.t("验证码加载失败 ({{status}})", { status: res.status }));
  const data = await res.json();
  return { token: data.token, answer: "", image: data.image };
}