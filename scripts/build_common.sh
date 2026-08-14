#!/usr/bin/env bash
# 共享打包配置：加载可选的 scripts/build.env 并解析全部 EAS 云端构建变量。
# 被 scripts/build_android.sh 与 scripts/build_ios.sh source 使用。
#
# 变量优先级：环境变量 > scripts/build.env > 脚本默认值。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
APP_CONFIG="$FRONTEND_DIR/app.json"
EAS_JSON="$FRONTEND_DIR/eas.json"
BUILD_ENV_FILE="$ROOT/scripts/build.env"

# 加载 scripts/build.env（不存在则跳过）。已在环境中定义的变量不会被覆盖。
if [ -f "$BUILD_ENV_FILE" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    case "$k" in ''|\#*) continue ;; esac
    # 去除键值两端空白
    k="${k#"${k%%[![:space:]]*}"}"
    k="${k%"${k##*[![:space:]]}"}"
    v="${v#"${v%%[![:space:]]*}"}"
    v="${v%"${v##*[![:space:]]}"}"
    if [ -z "${!k+x}" ]; then
      export "$k=$v"
    fi
  done < "$BUILD_ENV_FILE"
fi

# 默认值（app.json 优先，其次固定默认值）
APP_NAME="${APP_NAME:-$(node -p "require('$APP_CONFIG').expo.name ?? ''" 2>/dev/null)}"
APP_VERSION="${APP_VERSION:-$(node -p "require('$APP_CONFIG').expo.version ?? ''" 2>/dev/null)}"
[ -n "$APP_NAME" ] || APP_NAME="FinNav"
[ -n "$APP_VERSION" ] || APP_VERSION="1.0.0"

# Android
ANDROID_PACKAGE="${ANDROID_PACKAGE:-com.finnav.app}"
ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-$(echo "$APP_VERSION" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}')}"

# Android 允许明文 HTTP（仅当后端为无 TLS 的 http://IP:8000 且仅限调试/内网时开启）
ANDROID_ALLOW_CLEARTEXT="${ANDROID_ALLOW_CLEARTEXT:-}"
case "$ANDROID_ALLOW_CLEARTEXT" in
  1|true|True|TRUE|yes|Yes|YES|on|On|ON) ANDROID_ALLOW_CLEARTEXT=1 ;;
  *) ANDROID_ALLOW_CLEARTEXT= ;;
esac

# iOS
IOS_BUNDLE_IDENTIFIER="${IOS_BUNDLE_IDENTIFIER:-com.finnav.app}"
IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-1}"

# 打进包的后端 API 地址（留空则用前端内置默认逻辑）
EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-}"

# EAS 云端构建
# EAS_PROFILE 对应 frontend/eas.json 中的 build profile（preview / production）
EAS_PROFILE="${EAS_PROFILE:-preview}"
# EAS CLI 调用方式（CI 可固定版本，如 npx eas-cli@12.1.0）
EAS_CLI="${EAS_CLI:-npx --yes eas-cli@latest}"

# 产物目录（相对路径以仓库根为基准）
BUILD_OUTPUT_DIR="${BUILD_OUTPUT_DIR:-$FRONTEND_DIR/build}"
case "$BUILD_OUTPUT_DIR" in
  /*) ;;
  *) BUILD_OUTPUT_DIR="$ROOT/$BUILD_OUTPUT_DIR" ;;
esac

require_command() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "缺少必需命令: $cmd" >&2; exit 1; }
  done
}

print_build_summary() {
  local platform="$1"
  echo "--------------------------------------------"
  echo " 打包平台    : $platform (EAS 云端构建)"
  echo " 应用名      : $APP_NAME"
  echo " 版本        : $APP_VERSION"
  echo " EAS Profile : $EAS_PROFILE"
  if [ "$platform" = "android" ]; then
    echo " applicationId: $ANDROID_PACKAGE"
    echo " versionCode  : $ANDROID_VERSION_CODE"
    if [ -n "$ANDROID_ALLOW_CLEARTEXT" ]; then
      echo " 明文 HTTP   : 已开启 (usesCleartextTraffic=true，仅限调试/内网)"
    fi
  else
    echo " bundleId     : $IOS_BUNDLE_IDENTIFIER"
    echo " buildNumber  : $IOS_BUILD_NUMBER"
  fi
  echo " API 地址    : ${EXPO_PUBLIC_API_BASE_URL:-<前端默认逻辑>}"
  echo " 产物目录    : $BUILD_OUTPUT_DIR"
  echo "--------------------------------------------"
}

# 备份 app.json 与 eas.json，供构建结束后恢复（避免源码被注入的字段污染）。
backup_app_config() {
  CONFIG_BACKUP="$(mktemp)"
  cp "$APP_CONFIG" "$CONFIG_BACKUP"
}

restore_app_config() {
  cp "$CONFIG_BACKUP" "$APP_CONFIG"
  rm -f "$CONFIG_BACKUP"
}

backup_eas_config() {
  EAS_CONFIG_BACKUP="$(mktemp)"
  cp "$EAS_JSON" "$EAS_CONFIG_BACKUP"
}

restore_eas_config() {
  cp "$EAS_CONFIG_BACKUP" "$EAS_JSON"
  rm -f "$EAS_CONFIG_BACKUP"
}

# 按平台给 app.json 注入身份字段（Android: package/versionCode；iOS: bundleIdentifier/buildNumber）。
# ANDROID_ALLOW_CLEARTEXT=1 时额外注入 expo-build-properties 插件开启明文 HTTP（云端 prebuild 生效）。
patch_app_config() {
  local platform="$1"
  APP_CONFIG="$APP_CONFIG" APP_PLATFORM="$platform" \
  APP_NAME="$APP_NAME" APP_VERSION="$APP_VERSION" \
  ANDROID_PACKAGE="$ANDROID_PACKAGE" ANDROID_VERSION_CODE="$ANDROID_VERSION_CODE" \
  IOS_BUNDLE_IDENTIFIER="$IOS_BUNDLE_IDENTIFIER" IOS_BUILD_NUMBER="$IOS_BUILD_NUMBER" \
  ANDROID_ALLOW_CLEARTEXT="${ANDROID_ALLOW_CLEARTEXT:-}" \
  node <<'NODE'
const fs = require('fs');
const p = process.env.APP_CONFIG;
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
const expo = cfg.expo;
if (process.env.APP_NAME) expo.name = process.env.APP_NAME;
if (process.env.APP_VERSION) expo.version = process.env.APP_VERSION;
if (process.env.APP_PLATFORM === 'android') {
  expo.android = expo.android || {};
  if (process.env.ANDROID_PACKAGE) expo.android.package = process.env.ANDROID_PACKAGE;
  if (process.env.ANDROID_VERSION_CODE) expo.android.versionCode = Number(process.env.ANDROID_VERSION_CODE);
  if (process.env.ANDROID_ALLOW_CLEARTEXT) {
    expo.plugins = expo.plugins || [];
    if (!expo.plugins.some(p => Array.isArray(p) && p[0] === 'expo-build-properties')) {
      expo.plugins.push(['expo-build-properties', { android: { usesCleartextTraffic: true } }]);
    }
  }
}
if (process.env.APP_PLATFORM === 'ios') {
  expo.ios = expo.ios || {};
  if (process.env.IOS_BUNDLE_IDENTIFIER) expo.ios.bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
  if (process.env.IOS_BUILD_NUMBER) expo.ios.buildNumber = String(process.env.IOS_BUILD_NUMBER);
}
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
NODE
}

# 把 EXPO_PUBLIC_API_BASE_URL 临时注入 eas.json 指定 profile 的 env（构建后整文件还原）。
# eas.json 提交态不含 env 块（EAS 校验不允许空值）；仅在 API 地址非空时注入，云端 Metro 打到包里。
patch_eas_env() {
  EAS_JSON="$EAS_JSON" EAS_PROFILE="$EAS_PROFILE" EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-}" node <<'NODE'
const fs = require('fs');
const p = process.env.EAS_JSON;
const profile = process.env.EAS_PROFILE;
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
const b = cfg.build && cfg.build[profile];
if (!b) {
  console.error('eas.json 中不存在 profile: ' + profile);
  console.error('可用 profile: ' + Object.keys(cfg.build || {}).join(', '));
  process.exit(1);
}
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  b.env = b.env || {};
  b.env.EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
}
NODE
}

# 校验 EAS 前提：eas.json 存在、已登录（或设置 EXPO_TOKEN）、项目已关联。
require_eas() {
  require_command node npm
  [ -f "$EAS_JSON" ] || { echo "缺少 $EAS_JSON，请先执行: (cd $FRONTEND_DIR && npx eas-cli build:configure)" >&2; exit 1; }
  if ! $EAS_CLI whoami >/dev/null 2>&1; then
    echo "未登录 EAS。请先执行: npx eas-cli login（或为 CI 设置 EXPO_TOKEN 环境变量）。" >&2
    exit 1
  fi
  local project_id
  project_id="$(node -p "require('$APP_CONFIG').expo.extra?.eas?.projectId ?? ''" 2>/dev/null || true)"
  if [ -z "$project_id" ]; then
    echo "项目未关联 EAS。请先执行: (cd $FRONTEND_DIR && npx eas-cli init)" >&2
    exit 1
  fi
}

# 发起 EAS 云端构建并等待完成，成功后下载产物到 BUILD_OUTPUT_DIR/<platform>/。
# 参数: platform (android|ios)
run_eas_build() {
  local platform="$1"
  local json_file build_id
  json_file="$(mktemp)"

  echo "==> 发起 EAS 云端构建 ($platform / $EAS_PROFILE) ..."
  if ! $EAS_CLI build --platform "$platform" --profile "$EAS_PROFILE" --non-interactive --wait --json > "$json_file"; then
    echo "EAS 构建失败，详见上方日志。也可到 https://expo.dev 查看构建记录。" >&2
    rm -f "$json_file"
    exit 1
  fi

  build_id="$(node -e "
const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const arr = Array.isArray(d) ? d : [d];
const b = arr.find(x => x && (x.status === 'finished' || (x.artifacts && x.artifacts.buildUrl)));
console.log(b ? b.id : '');
" "$json_file" 2>/dev/null || true)"
  rm -f "$json_file"

  [ -n "$build_id" ] || { echo "未能从 EAS 返回结果中解析 build id。" >&2; exit 1; }
  echo "==> 构建完成，下载产物 (build-id: $build_id) ..."
  mkdir -p "$BUILD_OUTPUT_DIR/$platform"
  (cd "$BUILD_OUTPUT_DIR/$platform" && $EAS_CLI build:download --build-id "$build_id" --non-interactive)
}