'use client';

import { ConfigProvider, theme, App as AntdApp } from 'antd';
import type { ReactNode } from 'react';
import { bindMessage } from '@/components/antd-wrapper';

/**
 * Ant Design theme aligned with our CSS design tokens (globals.css)
 * Uses cssVar with prefix 'fn' to map to --fn-* variables
 */
const fnTheme = {
  token: {
    // Color - Core tokens mapped from --fn-*
    colorPrimary: '#4F46E5',
    colorSuccess: '#059669',
    colorError: '#DC2626',
    colorWarning: '#F59E0B',
    colorInfo: '#4F46E5',
    colorBgContainer: 'var(--fn-surface)',
    colorBgElevated: 'var(--fn-surface-elevated)',
    colorBgLayout: 'var(--fn-bg)',
    colorText: 'var(--fn-text)',
    colorTextSecondary: 'var(--fn-text-secondary)',
    colorTextTertiary: 'var(--fn-text-tertiary)',
    colorBorder: 'var(--fn-border)',
    colorBorderSecondary: 'var(--fn-divider)',

    // Radius
    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 10,
    borderRadiusXL: 14,

    // Font
    fontFamily: 'var(--fn-font-body)',
    fontFamilyCode: 'var(--fn-font-mono)',

    // Control height
    controlHeight: 40,
    controlHeightSM: 32,
    controlHeightLG: 48,

    // Shadows (for components that use token shadows)
    boxShadow: 'var(--fn-shadow-sm)',
    boxShadowSecondary: 'var(--fn-shadow-md)',

    // Motion
    motionDurationFast: '0.12s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
    motionEaseInOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    motionEaseIn: 'cubic-bezier(0.4, 0, 1, 1)',

    // Wireframe (zero visual weight for some components)
    wireframe: false,
  },
  // CSS Variable mode: maps tokens to --fn-*
  cssVar: { prefix: 'fn' },
  // Zero runtime: no inline styles, pure CSS
  zeroRuntime: true,
  // No hashed classnames
  hashed: false,
  // Inherit from parent theme if any
  inherit: true,
  // Algorithm: use default (light) — dark mode handled via CSS media query
  algorithm: theme.defaultAlgorithm,
};

// 将 App.useApp() 返回的上下文实例绑定到静态 message 代理上，
// 使各处 message.xxx() 调用都能消费 ConfigProvider 主题。
function MessageBinder() {
  const { message: appMessage } = AntdApp.useApp();
  bindMessage(appMessage);
  return null;
}

export function ConfigProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={fnTheme}>
      <AntdApp>
        <MessageBinder />
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}