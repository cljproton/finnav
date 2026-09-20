"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useCategories,
  useTags,
  useMySubmissions,
  submitSite,
  updateSiteSubmission,
  deleteSiteSubmission,
} from "../../lib/api";
import { Input, Button, Spin, Tag } from "@/components/antd-wrapper";
import { message } from "@/components/antd-wrapper";
import { Ionicons } from "../../components/ui/icons";
import { DeleteConfirmModal } from "../DeleteConfirmModal";
import SeoHeading from "../SeoHeading";
import type { SiteSubmission, SiteSubmissionStatus } from "../../lib/types";

const STATUS_TEXT: Record<SiteSubmissionStatus, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已驳回",
};

const STATUS_COLOR: Record<SiteSubmissionStatus, string> = {
  pending: "gold",
  approved: "green",
  rejected: "red",
};

export default function SubmitSiteClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: tags } = useTags();
  const { data: submissions, isLoading: subLoading } = useMySubmissions();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SiteSubmission | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.replace("/");
  };

  const refetchSub = () => {
    queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["site-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["sites"] });
    queryClient.invalidateQueries({ queryKey: ["site-ids"] });
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((x) => x !== tagName) : [...prev, tagName],
    );
  };

  const onSubmit = async () => {
    if (!name.trim()) {
      message.error(t("请填写站点名称"));
      return;
    }
    if (!url.trim()) {
      message.error(t("请填写站点地址"));
      return;
    }
    if (!category) {
      message.error(t("请选择分类"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        category,
        tags: selectedTags,
      };
      if (editingId !== null) {
        await updateSiteSubmission(editingId, payload);
        message.success(t("已更新，等待审核"));
      } else {
        await submitSite(payload);
        message.success(t("提交成功，等待审核"));
      }
      setName("");
      setUrl("");
      setDescription("");
      setCategory(null);
      setSelectedTags([]);
      setEditingId(null);
      refetchSub();
    } catch (e) {
      message.error(String(e instanceof Error ? e.message : t("提交失败")));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (s: SiteSubmission) => {
    setName(s.name);
    setUrl(s.url);
    setDescription(s.description || "");
    setCategory(s.category);
    setSelectedTags(s.tags || []);
    setEditingId(s.id);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setDescription("");
    setCategory(null);
    setSelectedTags([]);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const s = deleteConfirm;
    try {
      await deleteSiteSubmission(s.id);
      message.success(t("已删除"), 1.5);
      refetchSub();
    } catch (e) {
      message.error(String(e instanceof Error ? e.message : t("操作失败")), 1.5);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const cancelDelete = () => setDeleteConfirm(null);

  const pill = (active: boolean): React.CSSProperties => ({
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 7,
    paddingBottom: 7,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
    border: `1px solid ${active ? "var(--fn-primary)" : "var(--fn-border)"}`,
    backgroundColor: active ? "var(--fn-primary)" : "var(--fn-chip-bg)",
    color: active ? "var(--fn-surface-solid)" : "var(--fn-text)",
    cursor: "pointer",
  });

  const inputStyle: React.CSSProperties = {
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 15,
    backgroundColor: "var(--fn-surface)",
    color: "var(--fn-text)",
    boxShadow: "none",
  };

  const sectionHeader = (icon: string, title: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: "var(--fn-primary-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={17} color="var(--fn-primary)" />
      </div>
      <SeoHeading
        level={2}
        style={{ fontSize: 16, fontWeight: 600, color: "var(--fn-text)", flex: 1 }}
      >
        {title}
      </SeoHeading>
    </div>
  );

  return (
    <>
      <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
        <div
          ref={scrollRef}
          style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 48px" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 16,
              paddingBottom: 8,
            }}
          >
            <button
              type="button"
              onClick={goBack}
              aria-label={t("返回")}
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                backgroundColor: "var(--fn-surface)",
                border: "1px solid var(--fn-border)",
                boxShadow: "var(--fn-shadow-xs)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Ionicons name="chevron-back" size={22} color="var(--fn-text)" />
            </button>
            <SeoHeading
              level={1}
              style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)" }}
            >
              {t("提交新站点")}
            </SeoHeading>
            <div style={{ width: 42 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
            <div className="fn-card" style={{ padding: 20, boxShadow: "var(--fn-shadow-sm)" }}>
              {sectionHeader("add-circle-outline", t("站点信息"))}

              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--fn-text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("站点名称 *")}
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("例如：某金融数据平台")}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--fn-text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("站点地址 *")}
                </span>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--fn-text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("简介（可选）")}
                </span>
                <Input.TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("一句话介绍该站点")}
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--fn-text-secondary)", display: "block", marginBottom: 8 }}>
                  {t("分类 *")}
                </span>
                {catLoading ? (
                  <Spin size="small" />
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(categories ?? []).map((c) => {
                      const active = category === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategory(active ? null : c.id)}
                          style={pill(active)}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <span style={{ fontSize: 13, color: "var(--fn-text-secondary)", display: "block", marginBottom: 8 }}>
                  {t("标签（可选）")}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(tags ?? []).map((tag) => {
                    const active = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        style={pill(active)}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                type="primary"
                block
                onClick={onSubmit}
                disabled={submitting}
                style={{ height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700, marginTop: 24 }}
              >
                {submitting ? t("提交中...") : editingId !== null ? t("保存修改") : t("提交审核")}
              </Button>

              {editingId !== null ? (
                <div style={{ textAlign: "center", marginTop: 6 }}>
                  <Button type="link" onClick={cancelEdit} style={{ color: "var(--fn-text-tertiary)" }}>
                    {t("取消编辑")}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="fn-card" style={{ padding: 20, boxShadow: "var(--fn-shadow-sm)" }}>
              {sectionHeader("list-outline", t("我的提交记录"))}

              {subLoading ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Spin />
                </div>
              ) : !submissions || submissions.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                  {t("暂无提交记录")}
                </span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {submissions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: "1px solid var(--fn-border)",
                        backgroundColor: "var(--fn-surface)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 15,
                            fontWeight: 600,
                            color: "var(--fn-text)",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.name}
                        </span>
                        <Tag color={STATUS_COLOR[s.status]} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                          {STATUS_TEXT[s.status]}
                        </Tag>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--fn-text-tertiary)",
                          marginTop: 6,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.url}
                      </div>
                      {s.admin_note ? (
                        <div style={{ fontSize: 12, color: "var(--fn-text-tertiary)", marginTop: 4 }}>
                          {t("备注：{{note}}", { note: s.admin_note })}
                        </div>
                      ) : null}
                      {s.status === "rejected" ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-start" }}>
                          <Button size="small" onClick={() => handleEdit(s)}>
                            {t("编辑")}
                          </Button>
                          <Button size="small" danger onClick={() => setDeleteConfirm(s)}>
                            {t("删除")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <DeleteConfirmModal
        visible={!!deleteConfirm}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        name={deleteConfirm?.name ?? ""}
      />
    </>
  );
}