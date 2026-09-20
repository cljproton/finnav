"use client";

import { Modal } from "@/components/antd-wrapper";
import LoginPanel from "./LoginPanel";
import type { CaptchaPayload } from "../lib/auth";

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string, captcha: CaptchaPayload) => Promise<{ access: string; refresh: string }>;
  onRegister: (email: string, password: string, captcha: CaptchaPayload) => Promise<boolean>;
  onVerify: (email: string, code: string, password: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onResetPassword: (email: string, code: string, password: string) => Promise<void>;
}

export default function AuthModal({
  visible,
  onClose,
  onLogin,
  onRegister,
  onVerify,
  onRequestReset,
  onResetPassword,
}: AuthModalProps) {
  return (
    <Modal
      open={visible}
      onCancel={onClose}
      maskClosable
      destroyOnHidden
      centered
      width={360}
      footer={null}
      closeIcon={null}
      styles={{ body: { padding: 0 } }}
    >
      <LoginPanel
        onLogin={onLogin}
        onRegister={onRegister}
        onVerify={onVerify}
        onRequestReset={onRequestReset}
        onResetPassword={onResetPassword}
        onClose={onClose}
        onSuccess={onClose}
      />
    </Modal>
  );
}