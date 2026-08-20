import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Share,
  TextInput,
} from "react-native";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Toast from "@ant-design/react-native/es/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useThemeColors } from "../../constants/colors";
import { useTranslation } from "react-i18next";
import {
  useMyPoints,
  usePointRules,
  useMyPointTransactions,
  useMyPointsVouchers,
  transferPoints,
  createPointsVoucher,
  redeemPointsVoucher,
} from "../../lib/api";
import type { PointsVoucher } from "../../lib/types";
import { useAuth } from "../../lib/auth";
import AuthModal from "../../components/AuthModal";

const MIN_TRANSFER_AMOUNT = 10;
const MIN_VOUCHER_AMOUNT = 10;
const VOUCHER_VALID_DAYS = 30;

function inviteUrl(shareUrl: string, code: string): string {
  if (shareUrl) return shareUrl;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/?ref=${code}`;
  }
  try {
    return `${Linking.createURL("/")}?ref=${code}`;
  } catch {
    return `finnav:///?ref=${code}`;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy copy
  }
  try {
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // ignore
  }
  return false;
}

function ShareInvite({
  code,
  shareUrl,
  onCopied,
}: {
  code: string;
  shareUrl: string;
  onCopied: (text: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handleCopy = async () => {
    const url = inviteUrl(shareUrl, code);
    const ok = await copyText(url);
    if (ok) onCopied(url);
  };

  const handleShare = async () => {
    const url = inviteUrl(shareUrl, code);
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title: t("邀请好友"),
            text: t("用我的邀请链接注册 FinNav，我们都能获得积分"),
            url,
          });
          return;
        }
      } catch {
        // user cancelled or unavailable -> fallback copy
      }
      const ok = await copyText(url);
      if (ok) onCopied(url);
      return;
    }
    try {
      await Share.share({
        message: t("用我的邀请链接注册 FinNav，我们都能获得积分"),
        url,
        title: t("邀请好友"),
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={styles.inviteActions}>
      <Pressable
        onPress={handleShare}
        style={({ pressed }) => [
          styles.inviteBtn,
          styles.inviteBtnPrimary,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="share-social-outline" size={16} color={colors.surfaceSolid} />
        <Text style={[styles.inviteBtnText, { color: colors.surfaceSolid }]}>
          {t("分享邀请链接")}
        </Text>
      </Pressable>
      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [
          styles.inviteBtn,
          {
            backgroundColor: colors.chipBg,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons name="copy-outline" size={16} color={colors.text} />
        <Text style={[styles.inviteBtnText, { color: colors.text }]}>
          {t("复制链接")}
        </Text>
      </Pressable>
    </View>
  );
}

type TransferTab = "gift" | "voucher" | "redeem";

function TransferCard() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TransferTab>("gift");
  const [busy, setBusy] = useState(false);

  const [giftEmail, setGiftEmail] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  const [voucherAmount, setVoucherAmount] = useState("");
  const [createdVoucher, setCreatedVoucher] = useState<PointsVoucher | null>(null);

  const [redeemCode, setRedeemCode] = useState("");

  const { data: vouchers } = useMyPointsVouchers(true);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["me-points"] });
    queryClient.invalidateQueries({ queryKey: ["me-points-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["me-points-vouchers"] });
  };

  const handleGift = async () => {
    const email = giftEmail.trim().toLowerCase();
    if (!email) {
      Toast.fail(t("请输入对方邮箱"), 1.5);
      return;
    }
    const amount = Number(giftAmount);
    if (!Number.isInteger(amount) || amount < MIN_TRANSFER_AMOUNT) {
      Toast.fail(t("转赠面额至少 {{min}} 积分", { min: MIN_TRANSFER_AMOUNT }), 1.5);
      return;
    }
    setBusy(true);
    try {
      const res = await transferPoints(email, amount, giftMessage.trim());
      Toast.success(
        t("已转赠 {{amount}} 积分给 {{email}}", { amount, email: res.to_email }),
        1.5,
      );
      setGiftEmail("");
      setGiftAmount("");
      setGiftMessage("");
      invalidate();
    } catch (e) {
      Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVoucher = async () => {
    const amount = Number(voucherAmount);
    if (!Number.isInteger(amount) || amount < MIN_VOUCHER_AMOUNT) {
      Toast.fail(t("兑换码面额至少 {{min}} 积分", { min: MIN_VOUCHER_AMOUNT }), 1.5);
      return;
    }
    setBusy(true);
    try {
      const v = await createPointsVoucher(amount);
      setCreatedVoucher(v);
      setVoucherAmount("");
      invalidate();
      Toast.success(
        t("兑换码已生成，{{days}} 天内有效", { days: VOUCHER_VALID_DAYS }),
        1.5,
      );
    } catch (e) {
      Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      Toast.fail(t("请输入兑换码"), 1.5);
      return;
    }
    setBusy(true);
    try {
      const res = await redeemPointsVoucher(redeemCode.trim());
      Toast.success(
        t("到账 {{amount}} 积分，当前余额 {{balance}}", {
          amount: res.amount,
          balance: res.balance_after,
        }),
        1.5,
      );
      setRedeemCode("");
      invalidate();
    } catch (e) {
      Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyVoucher = async () => {
    if (!createdVoucher) return;
    const ok = await copyText(createdVoucher.code);
    Toast[ok ? "success" : "fail"](ok ? t("兑换码已复制") : t("复制失败"), 1.5);
  };

  const voucherStatusLabel = (v: PointsVoucher): string => {
    if (v.is_expired) return t("已过期");
    if (v.status === "used") return t("已核销");
    if (v.status === "revoked") return t("已作废");
    return t("待核销");
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("积分转赠")}</Text>
      </View>
      <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
        {t("免手续费，最低 {{min}} 积分", { min: MIN_TRANSFER_AMOUNT })}
      </Text>

      <View style={[styles.transferTabs, { backgroundColor: colors.chipBg }]}>
        {(
          [
            ["gift", t("转赠给账号")],
            ["voucher", t("生成兑换码")],
            ["redeem", t("核销兑换码")],
          ] as [TransferTab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.transferTab, tab === key && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.transferTabText,
                { color: tab === key ? colors.surfaceSolid : colors.textSecondary },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "gift" ? (
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t("对方邮箱")}
          </Text>
          <TextInput
            value={giftEmail}
            onChangeText={setGiftEmail}
            placeholder={t("对方账号邮箱")}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[
              styles.transferInput,
              { color: colors.text, backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t("转赠数量（积分）")}
          </Text>
          <TextInput
            value={giftAmount}
            onChangeText={(text) => setGiftAmount(text.replace(/[^0-9]/g, ""))}
            placeholder={`${MIN_TRANSFER_AMOUNT}+`}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            style={[
              styles.transferInput,
              { color: colors.text, backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t("留言（可选）")}
          </Text>
          <TextInput
            value={giftMessage}
            onChangeText={setGiftMessage}
            placeholder={t("给好友说点什么")}
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            style={[
              styles.transferInput,
              { color: colors.text, backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={handleGift}
            disabled={busy}
            style={({ pressed }) => [
              styles.transferBtn,
              { backgroundColor: colors.primary, opacity: pressed || busy ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.transferBtnText, { color: colors.surfaceSolid }]}>
              {busy ? t("转赠中…") : t("转赠")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {tab === "voucher" ? (
        <View>
          <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
            {t("生成后可将兑换码发给任意账号核销，生成时从余额扣除，不退还")}
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t("兑换码面额（积分）")}
          </Text>
          <TextInput
            value={voucherAmount}
            onChangeText={(text) => setVoucherAmount(text.replace(/[^0-9]/g, ""))}
            placeholder={`${MIN_VOUCHER_AMOUNT}+`}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            style={[
              styles.transferInput,
              { color: colors.text, backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={handleCreateVoucher}
            disabled={busy}
            style={({ pressed }) => [
              styles.transferBtn,
              { backgroundColor: colors.primary, opacity: pressed || busy ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.transferBtnText, { color: colors.surfaceSolid }]}>
              {busy ? t("生成中…") : t("生成兑换码")}
            </Text>
          </Pressable>
          {createdVoucher ? (
            <View
              style={[
                styles.voucherBox,
                { backgroundColor: colors.chipBg, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.voucherLabel, { color: colors.textTertiary }]}>
                {t("面额 {{amount}} 积分", { amount: createdVoucher.amount })}
              </Text>
              <Text style={[styles.voucherCode, { color: colors.primary }]}>
                {createdVoucher.code}
              </Text>
              <Text style={[styles.voucherMeta, { color: colors.textTertiary }]}>
                {t("有效期至 {{time}}", {
                  time: (createdVoucher.expires_at ?? "").replace("T", " ").slice(0, 10),
                })}
              </Text>
              <Pressable
                onPress={handleCopyVoucher}
                style={({ pressed }) => [
                  styles.transferBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.transferBtnText, { color: colors.surfaceSolid }]}>
                  {t("复制兑换码")}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === "redeem" ? (
        <View>
          <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
            {t("输入好友给你的兑换码，面额到账")}
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t("兑换码")}
          </Text>
          <TextInput
            value={redeemCode}
            onChangeText={(text) => setRedeemCode(text.toUpperCase())}
            placeholder={t("输入兑换码")}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[
              styles.transferInput,
              styles.redeemInput,
              { color: colors.text, backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={handleRedeem}
            disabled={busy}
            style={({ pressed }) => [
              styles.transferBtn,
              { backgroundColor: colors.primary, opacity: pressed || busy ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.transferBtnText, { color: colors.surfaceSolid }]}>
              {busy ? t("核销中…") : t("核销")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.myVouchersHeader}>
        <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
        <Text style={[styles.myVouchersTitle, { color: colors.text }]}>
          {t("我的兑换码")}
        </Text>
      </View>
      {!vouchers || vouchers.length === 0 ? (
        <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
          {t("暂无兑换码")}
        </Text>
      ) : (
        vouchers.map((v, idx) => (
          <View
            key={v.id}
            style={[
              styles.voucherRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
            ]}
          >
            <View style={styles.voucherRowLeft}>
              <Text style={[styles.voucherRowCode, { color: colors.text }]}>
                {v.code}
              </Text>
              <Text style={[styles.voucherRowMeta, { color: colors.textTertiary }]}>
                {v.is_expired
                  ? t("已过期")
                  : v.redeemed_at
                    ? t("核销于 {{time}}", {
                        time: v.redeemed_at.replace("T", " ").slice(0, 10),
                      })
                    : t("有效期至 {{time}}", {
                        time: (v.expires_at ?? "").replace("T", " ").slice(0, 10),
                      })}
              </Text>
            </View>
            <View style={styles.voucherRowRight}>
              <Text style={[styles.voucherRowAmount, { color: colors.primary }]}>
                {v.amount}
              </Text>
              <Text
                style={[
                  styles.voucherRowStatus,
                  {
                    color: v.is_expired || v.status === "revoked"
                      ? colors.textTertiary
                      : v.status === "used"
                        ? colors.textSecondary
                        : colors.success,
                  },
                ]}
              >
                {voucherStatusLabel(v)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export default function PointsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.user;
  const [authVisible, setAuthVisible] = useState(false);

  const { data: points } = useMyPoints(loggedIn);
  const { data: rules } = usePointRules();
  const { data: txPages, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyPointTransactions(loggedIn);

  const transactions = txPages?.pages.flatMap((p) => p.results) ?? [];
  const balance = points?.balance ?? 0;
  const lifetime = points?.lifetime ?? 0;
  const referralCode = points?.referral_code ?? "";
  const referralShareUrl = points?.referral_share_url ?? "";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            hasNextPage &&
            !isFetchingNextPage &&
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 80
          ) {
            fetchNextPage();
          }
        }}
        scrollEventThrottle={16}
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
          <Text style={[styles.topTitle, { color: colors.text }]}>
            {t("积分中心")}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          {!loggedIn ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.emptyIconWrap}>
                <Ionicons name="trophy-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t("登录后查看积分与邀请奖励")}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                {t("提交站点、分享教程、提交 APP 链接，审核通过即得积分")}
              </Text>
              <Pressable
                onPress={() => setAuthVisible(true)}
                style={({ pressed }) => [
                  styles.loginBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.loginBtnText, { color: colors.surfaceSolid }]}>
                  {t("立即登录 / 注册")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* 积分余额 */}
              <View
                style={[
                  styles.card,
                  styles.balanceCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.balanceLabel, { color: colors.textTertiary }]}>
                  {t("积分余额")}
                </Text>
                <Text style={[styles.balanceValue, { color: colors.primary }]}>
                  {balance}
                </Text>
                <Text style={[styles.balanceSub, { color: colors.textTertiary }]}>
                  {t("累计获得 {{lifetime}} 分", { lifetime })}
                </Text>
              </View>

              {/* 邀请推广 */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Ionicons name="gift-outline" size={18} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {t("邀请好友得积分")}
                  </Text>
                </View>
                <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
                  {t("好友通过你的邀请链接注册，你与好友各得奖励积分")}
                </Text>
                <View style={styles.codeRow}>
                  <Text style={[styles.codeLabel, { color: colors.textTertiary }]}>
                    {t("我的邀请码")}
                  </Text>
                  <Text style={[styles.codeValue, { color: colors.text }]}>
                    {referralCode || "—"}
                  </Text>
                </View>
                <ShareInvite
                  code={referralCode}
                  shareUrl={referralShareUrl}
                  onCopied={() => Toast.success(t("邀请链接已复制"), 1.5)}
                />
              </View>

              {/* 积分转赠 */}
              <View style={{ marginTop: 22 }}>
                <TransferCard />
              </View>

              {/* 赚积分途径 */}
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t("如何赚积分")}
                </Text>
              </View>
              <View
                style={[
                  styles.card,
                  styles.rulesCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {(rules ?? []).map((rule, idx) => (
                  <View
                    key={rule.code}
                    style={[
                      styles.ruleRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                    ]}
                  >
                    <Text style={[styles.ruleName, { color: colors.text }]}>
                      {rule.name}
                    </Text>
                    <View style={styles.ruleRight}>
                      <Text style={[styles.rulePoints, { color: colors.primary }]}>
                        +{rule.points}
                      </Text>
                    </View>
                  </View>
                ))}
                {!rules || rules.length === 0 ? (
                  <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                    {t("暂无积分规则")}
                  </Text>
                ) : null}
              </View>

              {/* 积分流水 */}
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t("积分流水")}
                </Text>
              </View>
              <View
                style={[
                  styles.card,
                  styles.rulesCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {transactions.length === 0 ? (
                  <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                    {t("还没有积分记录，快去参与吧")}
                  </Text>
                ) : (
                  transactions.map((tx, idx) => (
                    <View
                      key={tx.id}
                      style={[
                        styles.txRow,
                        idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                      ]}
                    >
                      <View style={styles.txLeft}>
                        <Text style={[styles.txName, { color: colors.text }]}>
                          {tx.rule_name || tx.description || tx.ref_type}
                        </Text>
                        <Text style={[styles.txTime, { color: colors.textTertiary }]}>
                          {tx.description}
                        </Text>
                        <Text style={[styles.txTime, { color: colors.textTertiary }]}>
                          {tx.created_at?.replace("T", " ").slice(0, 16)}
                        </Text>
                      </View>
                      <View style={styles.txRight}>
                        <Text
                          style={[
                            styles.txAmount,
                            { color: tx.amount >= 0 ? colors.success : colors.error },
                          ]}
                        >
                          {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                        </Text>
                        <Text style={[styles.txBalance, { color: colors.textTertiary }]}>
                          {t("余额 {{balance}}", { balance: tx.balance_after })}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                {hasNextPage ? (
                  <Pressable
                    onPress={() => fetchNextPage()}
                    style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      {isFetchingNextPage ? t("加载中…") : t("加载更多")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={(email, password, captcha) => auth.login(email, password, captcha)}
        onLoginTFA={(email, totpToken, code) => auth.loginTFA(email, totpToken, code)}
        onRegister={(email, password, captcha) => auth.register(email, password, captcha)}
        onVerify={(email, code, password) => auth.verify(email, code, password)}
        onRequestReset={(email) => auth.requestPasswordReset(email)}
        onResetPassword={(email, code, password) =>
          auth.resetPassword(email, code, password)
        }
      />
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
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  balanceCard: {
    alignItems: "center",
    paddingVertical: 26,
  },
  balanceLabel: {
    fontSize: 13,
  },
  balanceValue: {
    fontSize: 44,
    fontWeight: "800",
    marginTop: 6,
  },
  balanceSub: {
    fontSize: 13,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  codeLabel: {
    fontSize: 13,
  },
  codeValue: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  inviteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  inviteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  inviteBtnPrimary: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  inviteBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  rulesCard: {
    paddingVertical: 6,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  ruleName: {
    fontSize: 14,
    flex: 1,
  },
  ruleRight: {
    marginLeft: 10,
  },
  rulePoints: {
    fontSize: 15,
    fontWeight: "700",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  txLeft: {
    flex: 1,
    marginRight: 12,
  },
  txName: {
    fontSize: 14,
    fontWeight: "600",
  },
  txTime: {
    fontSize: 12,
    marginTop: 3,
  },
  txRight: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  txBalance: {
    fontSize: 12,
    marginTop: 3,
  },
  loadMoreBtn: {
    marginTop: 8,
    borderTopWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyIconWrap: {
    marginBottom: 12,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },
  loginBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    alignItems: "center",
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  transferTabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 10,
    marginTop: 14,
  },
  transferTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 8,
  },
  transferTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
  },
  transferInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  redeemInput: {
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  transferBtn: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  transferBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  voucherBox: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  voucherLabel: {
    fontSize: 13,
  },
  voucherCode: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 3,
    marginTop: 8,
  },
  voucherMeta: {
    fontSize: 12,
    marginTop: 6,
  },
  myVouchersHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  myVouchersTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  voucherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  voucherRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  voucherRowCode: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 2,
  },
  voucherRowMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  voucherRowRight: {
    alignItems: "flex-end",
  },
  voucherRowAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  voucherRowStatus: {
    fontSize: 12,
    marginTop: 3,
  },
});