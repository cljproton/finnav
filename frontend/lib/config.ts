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

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}

// 注意：Metro 会把未设置的 EXPO_PUBLIC_* 变量也内联为空串 ""（而非 undefined），
// 所以不能靠「env 是否定义」区分开发/生产，改用 NODE_ENV + 平台判断。
// - 显式设置 EXPO_PUBLIC_API_BASE_URL：直接使用该地址（如 https://api.example.com）
// - Web 生产构建（expo export / Dockerfile EXPO_PUBLIC_API_BASE_URL=""）：
//   API_BASE_URL 保持空串，以相对路径 /api 同源请求，经 nginx 反代到后端
//   （支持一体式部署，也支持外层 nginx 接入域名/HTTPS——不再硬拼 :8000 端口）
// - 其余场景（本地开发、原生打包）：走 defaultBaseUrl()（Web 跟随主机名 :8000 等）
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  ? normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL)
  : Platform.OS === "web" && process.env.NODE_ENV === "production"
    ? ""
    : defaultBaseUrl();

export const API_URL = `${API_BASE_URL}/api`;