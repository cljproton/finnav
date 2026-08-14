#!/usr/bin/env bash
# 构建 Android 安装包（EAS 云端构建，本地无需 Android SDK / JDK）。
# 用法: ./scripts/build_android.sh
# 配置: scripts/build.env 或环境变量（详见 scripts/build.env.example）。
# 产物: frontend/build/android/finnav-<版本>-<EAS_PROFILE>-android.{apk,aab}
#       （EAS_PROFILE=production 时为 aab）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=build_common.sh
source "$SCRIPT_DIR/build_common.sh"

print_build_summary android
require_eas

# 备份 app.json 与 eas.json，退出时恢复（避免源码被注入的字段污染）
backup_app_config
backup_eas_config
trap 'restore_app_config; restore_eas_config' EXIT

patch_app_config android
patch_eas_env

cd "$FRONTEND_DIR"
run_eas_build android

ART_FILE="$(ls -t "$BUILD_OUTPUT_DIR/android"/*.apk "$BUILD_OUTPUT_DIR/android"/*.aab 2>/dev/null | head -1)"
[ -n "$ART_FILE" ] || { echo "未在 $BUILD_OUTPUT_DIR/android 找到构建产物 (*.apk / *.aab)" >&2; exit 1; }

case "$ART_FILE" in
  *.aab) ART_EXT="aab" ;;
  *)     ART_EXT="apk" ;;
esac
ART_NAME="finnav-${APP_VERSION}-${EAS_PROFILE}-android.${ART_EXT}"
mv "$ART_FILE" "$BUILD_OUTPUT_DIR/android/$ART_NAME"

echo "==> 完成: $BUILD_OUTPUT_DIR/android/$ART_NAME"