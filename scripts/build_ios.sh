#!/usr/bin/env bash
# 构建 iOS 设备包 (.ipa)（EAS 云端构建，本地无需 macOS / Xcode / CocoaPods）。
# Expo SDK 55 / React Native 0.83，最低 iOS 15.1（兼容 iPhone 6s Plus iOS 15.8.8 与 iPadOS 26.2）。
# 用法: ./scripts/build_ios.sh
# 配置: scripts/build.env 或环境变量（详见 scripts/build.env.example）。
# 前提: 首次需在 EAS 配置 Apple 签名凭据（npx eas-cli credentials）。
# 产物: frontend/build/ios/finnav-<版本>-<EAS_PROFILE>-ios.ipa
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=build_common.sh
source "$SCRIPT_DIR/build_common.sh"

print_build_summary ios
require_eas

# 备份 app.json 与 eas.json，退出时恢复（避免源码被注入的字段污染）
backup_app_config
backup_eas_config
trap 'restore_app_config; restore_eas_config' EXIT

patch_app_config ios
patch_eas_env

cd "$FRONTEND_DIR"
run_eas_build ios

IPA_FILE="$(ls -t "$BUILD_OUTPUT_DIR/ios"/*.ipa 2>/dev/null | head -1)"
[ -n "$IPA_FILE" ] || { echo "未在 $BUILD_OUTPUT_DIR/ios 找到 .ipa" >&2; exit 1; }

IPA_NAME="finnav-${APP_VERSION}-${EAS_PROFILE}-ios.ipa"
mv "$IPA_FILE" "$BUILD_OUTPUT_DIR/ios/$IPA_NAME"

echo "==> 完成: $BUILD_OUTPUT_DIR/ios/$IPA_NAME"