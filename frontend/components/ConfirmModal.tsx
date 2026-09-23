"use client";

import { useTranslation } from "react-i18next";
import { Modal, Button } from "@/components/antd-wrapper";

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  destructive?: boolean;
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  destructive = false,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={visible}
      onOk={onConfirm}
      onCancel={onClose}
      maskClosable
      destroyOnHidden
      centered
      width={360}
      footer={[
        <Button key="cancel" onClick={onClose} type="default" style={{ paddingInline: 12, paddingBlock: 8 }}>
          {t("取消")}
        </Button>,
        <Button
          key="confirm"
          onClick={onConfirm}
          type={destructive ? "primary" : "default"}
          danger={destructive}
          style={{ paddingInline: 12, paddingBlock: 8 }}
        >
          {confirmText ?? t("确认")}
        </Button>,
      ]}
      styles={{ body: { padding: 20, textAlign: "center" } }}
    >
      <div className="fn-text-lg fn-font-bold fn-text-primary fn-mb-2.5" style={{ fontSize: 17, fontWeight: 700 }}>
        {title}
      </div>
      <div className="fn-text-sm fn-text-tertiary fn-mb-4 fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "20px" }}>
        {message}
      </div>
    </Modal>
  );
}