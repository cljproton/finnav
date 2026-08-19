import AsyncStorage from "@react-native-async-storage/async-storage";

// 暂存通过邀请链接进入 App 时带来的推广码，注册时随请求提交。
// 注册成功后清除，避免下次注册仍带上旧码。
const REFERRAL_STORAGE_KEY = "pending_referral";

export async function getPendingReferral(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(REFERRAL_STORAGE_KEY)) || "";
  } catch {
    return "";
  }
}

export async function savePendingReferral(code: string): Promise<void> {
  const cleaned = normalizeReferralCode(code);
  if (!cleaned) return;
  try {
    await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, cleaned);
  } catch {
    // ignore
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function normalizeReferralCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().toUpperCase().match(/[A-Z2-9]{1,12}/);
  return match ? match[0] : "";
}
