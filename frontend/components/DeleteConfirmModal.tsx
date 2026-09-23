"use client";

import { useTranslation } from "react-i18next";
import { Modal, Button } from "@/components/antd-wrapper";

interface DeleteConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
}

export function DeleteConfirmModal({ visible, onClose, onConfirm, name }: DeleteConfirmModalProps) {
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
        <Button key="confirm" onClick={onConfirm} type="primary" danger style={{ paddingInline: 12, paddingBlock: 8 }}>
          {t("确认删除")}
        </Button>,
      ]}
      styles={{ body: { padding: 20, textAlign: "center" } }}
    >
      <div className="fn-text-lg fn-font-bold fn-text-primary fn-mb-2.5" style={{ fontSize: 17, fontWeight: 700 }}>
        {t("删除")}
      </div>
      <div className="fn-text-sm fn-text-tertiary fn-mb-4 fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "20px" }}>
        {t("确认删除「{{name}}」？已驳回的提交将直接删除。", { name })}
      </div>
    </Modal>
  );
}