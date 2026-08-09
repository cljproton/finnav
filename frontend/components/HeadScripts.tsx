import { useEffect } from "react";
import { Platform } from "react-native";
import { useSettings } from "../lib/api";

/**
 * Web 端注入后台配置的前端 <head> 自定义脚本（head_scripts）。
 * 仅在 web 平台生效（native 直接跳过），脚本会原样追加到 <head>。
 */
export default function HeadScripts() {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const raw = settings?.head_scripts;
    if (!raw) return;
    const container = document.createElement("div");
    container.innerHTML = raw;
    // 依次把生成的节点插入 <head>（script 用独立节点重新执行，确保起效）
    Array.from(container.children).forEach((el) => {
      if (el.tagName === "SCRIPT") {
        const script = document.createElement("script");
        Array.from(el.attributes).forEach((attr) => {
          script.setAttribute(attr.name, attr.value);
        });
        if (script.src) {
          script.async = true;
        } else {
          script.text = el.textContent || "";
        }
        document.head.appendChild(script);
      } else {
        document.head.appendChild(el.cloneNode(true));
      }
    });
  }, [settings]);

  return null;
}