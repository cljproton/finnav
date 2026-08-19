import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "@ant-design/react-native/es/toast";
import Modal from "@ant-design/react-native/es/modal";
import { useThemeColors } from "../../constants/colors";
import {
  useCategories,
  useTags,
  useMySubmissions,
  submitSite,
  updateSiteSubmission,
  deleteSiteSubmission,
} from "../../lib/api";
import { useTranslation } from "react-i18next";
import type { SiteSubmission, SiteSubmissionStatus } from "../../lib/types";

export default function SubmitSiteScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const STATUS_TEXT: Record<SiteSubmissionStatus, string> = {
    pending: t("审核中"),
    approved: t("已通过"),
    rejected: t("已驳回"),
  };

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: tags } = useTags();
  const {
    data: submissions,
    isLoading: subLoading,
    refetch: refetchSubmissions,
  } = useMySubmissions();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const toggleTag = (t: string) => {
    setSelectedTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const onSubmit = async () => {
    if (!name.trim()) {
      Toast.fail(t("请填写站点名称"));
      return;
    }
    if (!url.trim()) {
      Toast.fail(t("请填写站点地址"));
      return;
    }
    if (!category) {
      Toast.fail(t("请选择分类"));
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
        Toast.success(t("已更新，等待审核"));
      } else {
        await submitSite(payload);
        Toast.success(t("提交成功，等待审核"));
      }
      setName("");
      setUrl("");
      setDescription("");
      setCategory(null);
      setSelectedTags([]);
      setEditingId(null);
      refetchSubmissions();
      queryClient.invalidateQueries({ queryKey: ["site-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site-ids"] });
    } catch (e) {
      Toast.fail(String(e instanceof Error ? e.message : t("提交失败")));
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
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setDescription("");
    setCategory(null);
    setSelectedTags([]);
  };

  const handleDelete = (s: SiteSubmission) => {
    Modal.alert(
      t("删除"),
      t("确认删除「{{name}}」？已驳回的提交将直接删除。", { name: s.name }),
      [
        { text: t("取消"), style: "cancel" },
        {
          text: t("确认删除"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSiteSubmission(s.id);
              Toast.success(t("已删除"), 1.5);
              refetchSubmissions();
              queryClient.invalidateQueries({ queryKey: ["site-submissions"] });
              queryClient.invalidateQueries({ queryKey: ["sites"] });
              queryClient.invalidateQueries({ queryKey: ["site-ids"] });
            } catch (e) {
              Toast.fail(
                String(e instanceof Error ? e.message : t("操作失败")),
                1.5,
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.text }]}>{t("提交新站点")}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("站点信息")}</Text>

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("站点名称 *")}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("例如：某金融数据平台")}
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("站点地址 *")}</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("简介（可选）")}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("一句话介绍该站点")}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multiline, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("分类 *")}</Text>
          {catLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.chipWrap}>
              {(categories ?? []).map((c) => {
                const active = category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategory(active ? null : c.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.chipBg,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? colors.surfaceSolid : colors.text },
                      ]}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("标签（可选）")}</Text>
          <View style={styles.chipWrap}>
            {(tags ?? []).map((t) => {
              const active = selectedTags.includes(t.name);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggleTag(t.name)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.chipBg,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.surfaceSolid : colors.text },
                    ]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.submitText, { color: colors.surfaceSolid }]}>
              {submitting
                ? t("提交中...")
                : editingId !== null
                  ? t("保存修改")
                  : t("提交审核")}
            </Text>
          </Pressable>

          {editingId !== null ? (
            <Pressable onPress={cancelEdit} hitSlop={8} style={styles.cancelEditBtn}>
              <Text style={[styles.cancelEditText, { color: colors.textTertiary }]}>
                {t("取消编辑")}
              </Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionTitle, styles.listTitle, { color: colors.text }]}>
            {t("我的提交记录")}
          </Text>

          {subLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : !submissions || submissions.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              {t("暂无提交记录")}
            </Text>
          ) : (
            submissions.map((s) => {
              const statusColor =
                s.status === "approved"
                  ? colors.success
                  : s.status === "rejected"
                    ? colors.error
                    : colors.warning;
              return (
                <View
                  key={s.id}
                  style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.itemHead}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusColor + "1a" },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {STATUS_TEXT[s.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.itemUrl, { color: colors.textTertiary }]} numberOfLines={1}>
                    {s.url}
                  </Text>
                  {s.admin_note ? (
                    <Text style={[styles.itemNote, { color: colors.textTertiary }]}>
                      {t("备注：{{note}}", { note: s.admin_note })}
                    </Text>
                  ) : null}
                  {s.status === "rejected" ? (
                    <View style={styles.itemActions}>
                      <Pressable
                        onPress={() => handleEdit(s)}
                        hitSlop={8}
                        style={[styles.itemActionBtn, { borderColor: colors.primary }]}
                      >
                        <Text style={[styles.itemActionText, { color: colors.primary }]}>
                          {t("编辑")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(s)}
                        hitSlop={8}
                        style={[styles.itemActionBtn, { borderColor: colors.error }]}
                      >
                        <Text style={[styles.itemActionText, { color: colors.error }]}>
                          {t("删除")}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  listTitle: {
    marginTop: 28,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    marginVertical: 12,
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  itemHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemUrl: {
    fontSize: 12,
    marginTop: 6,
  },
  itemNote: {
    fontSize: 12,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  itemActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cancelEditBtn: {
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
