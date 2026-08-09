import { Platform } from "react-native";

const BACKEND_PORT = 8000;

function defaultBaseUrl(): string {
  // Web（含手机浏览器访问局域网前端时）：跟随页面所访问的主机，自动指向同一主机上的后端。
  // 例如用 http://<局域网IP>:8081 打开页面时，这里就是 http://<局域网IP>:8000。
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:${BACKEND_PORT}`;
  }
  // Android 模拟器：宿主机由 10.0.2.2 代表；真机走上面的 web 分支或设 EXPO_PUBLIC_API_BASE_URL。
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }
  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultBaseUrl();

export const API_URL = `${API_BASE_URL}/api`;