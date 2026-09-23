"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import {
  useMyPoints,
  usePointRules,
  useMyPointTransactions,
  useMyPointsVouchers,
  transferPoints,
  createPointsVoucher,
  redeemPointsVoucher,
} from "../../lib/api";
import { Ionicons } from "../../components/ui/icons";
import { Input, Button } from "@/components/antd-wrapper";
import { message } from "@/components/antd-wrapper";
import AuthModal from "../AuthModal";
import { copyText, inviteUrl } from "../../lib/utils";
import type { PointsVoucher } from "../../lib/types";

const MIN_TRANSFER_AMOUNT = 10;
const MIN_VOUCHER_AMOUNT = 10;
const VOUCHER_VALID_DAYS = 30;

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

  const handleCopy = async () => {
    const url = inviteUrl(shareUrl, code);
    const ok = await copyText(url);
    if (ok) onCopied(url);
  };

  const handleShare = async () => {
    const url = inviteUrl(shareUrl, code);
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
  };

  return (
    <div className="fn-flex fn-gap-2.5">
      <button
        type="button"
        onClick={handleShare}
        className="fn-flex-1 fn-flex fn-items-center fn-justify-center fn-gap-1.5 fn-rounded-md fn-border fn-py-3 fn-transition-fast fn-cursor-pointer"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingTop: 12,
          paddingBottom: 12,
          borderRadius: 10,
          borderWidth: 1,
          backgroundColor: "var(--fn-primary)",
          borderColor: "var(--fn-primary)",
        }}
        onMouseDown={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseUp={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <Ionicons name="share-social-outline" size={16} color="var(--fn-surface-solid)" />
        <span className="fn-text-md fn-font-semibold fn-text-inverse" style={{ fontSize: 14, fontWeight: 600 }}>
          {t("分享邀请链接")}
        </span>
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="fn-flex-1 fn-flex fn-items-center fn-justify-center fn-gap-1.5 fn-rounded-md fn-border-default fn-py-3 fn-transition-fast fn-cursor-pointer"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingTop: 12,
          paddingBottom: 12,
          borderRadius: 10,
          borderWidth: 1,
          backgroundColor: "var(--fn-chip-bg)",
          borderColor: "var(--fn-border)",
        }}
        onMouseDown={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseUp={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <Ionicons name="copy-outline" size={16} color="var(--fn-text)" />
        <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 14, fontWeight: 600 }}>
          {t("复制链接")}
        </span>
      </button>
    </div>
  );
}

type TransferTab = "gift" | "voucher" | "redeem";

function TransferCard() {
  const { t } = useTranslation();
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
      message.error(t("请输入对方邮箱"), 1.5);
      return;
    }
    const amount = Number(giftAmount);
    if (!Number.isInteger(amount) || amount < MIN_TRANSFER_AMOUNT) {
      message.error(t("转赠面额至少 {{min}} 积分", { min: MIN_TRANSFER_AMOUNT }), 1.5);
      return;
    }
    setBusy(true);
    try {
      const res = await transferPoints(email, amount, giftMessage.trim());
      message.success(t("已转赠 {{amount}} 积分给 {{email}}", { amount, email: res.to_email }), 1.5);
      setGiftEmail("");
      setGiftAmount("");
      setGiftMessage("");
      invalidate();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVoucher = async () => {
    const amount = Number(voucherAmount);
    if (!Number.isInteger(amount) || amount < MIN_VOUCHER_AMOUNT) {
      message.error(t("兑换码面额至少 {{min}} 积分", { min: MIN_VOUCHER_AMOUNT }), 1.5);
      return;
    }
    setBusy(true);
    try {
      const v = await createPointsVoucher(amount);
      setCreatedVoucher(v);
      setVoucherAmount("");
      invalidate();
      message.success(t("兑换码已生成，{{days}} 天内有效", { days: VOUCHER_VALID_DAYS }), 1.5);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      message.error(t("请输入兑换码"), 1.5);
      return;
    }
    setBusy(true);
    try {
      const res = await redeemPointsVoucher(redeemCode.trim());
      message.success(
        t("到账 {{amount}} 积分，当前余额 {{balance}}", { amount: res.amount, balance: res.balance_after }),
        1.5,
      );
      setRedeemCode("");
      invalidate();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyVoucher = async () => {
    if (!createdVoucher) return;
    const ok = await copyText(createdVoucher.code);
    if (ok) {
      message.success(t("兑换码已复制"), 1.5);
    } else {
      message.error(t("复制失败"), 1.5);
    }
  };

  const voucherStatusLabel = (v: PointsVoucher): string => {
    if (v.is_expired) return t("已过期");
    if (v.status === "used") return t("已核销");
    if (v.status === "revoked") return t("已作废");
    return t("待核销");
  };

  return (
    <div className="fn-rounded-lg fn-border-default fn-bg-surface fn-p-5" style={{ borderRadius: 14, borderWidth: 1, backgroundColor: "var(--fn-surface)", padding: 20 }}>
      <div className="fn-flex fn-items-center fn-gap-2 fn-mb-1.5" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Ionicons name="swap-horizontal" size={18} color="var(--fn-primary)" />
        <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>
          {t("积分转赠")}
        </span>
      </div>
      <span className="fn-text-sm fn-text-tertiary fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "16px" }}>
        {t("免手续费，最低 {{min}} 积分", { min: MIN_TRANSFER_AMOUNT })}
      </span>

      <div className="fn-flex fn-gap-1 fn-rounded-md fn-p-1 fn-mt-3.5" style={{ display: "flex", flexDirection: "row", gap: 4, padding: 4, borderRadius: 10, backgroundColor: "var(--fn-chip-bg)", marginTop: 14 }}>
        {(["gift", "voucher", "redeem"] as TransferTab[]).map((key) => {
          const labels = { gift: t("转赠给账号"), voucher: t("生成兑换码"), redeem: t("核销兑换码") };
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="fn-flex-1 fn-flex fn-items-center fn-py-2.25 fn-rounded-md fn-transition-fast fn-cursor-pointer"
              style={{
                flex: 1,
                alignItems: "center",
                paddingTop: 9,
                paddingBottom: 9,
                borderRadius: 8,
                backgroundColor: tab === key ? "var(--fn-primary)" : "transparent",
              }}
              onMouseDown={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseUp={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <span className="fn-text-sm fn-font-semibold" style={{ fontSize: 13, fontWeight: 600, color: tab === key ? "var(--fn-surface-solid)" : "var(--fn-text-secondary)" }}>
                {labels[key]}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "gift" && (
        <div>
          <span className="fn-text-sm fn-text-secondary fn-mt-3.5 fn-mb-1.5" style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            {t("对方邮箱")}
          </span>
          <Input
            value={giftEmail}
            onChange={(e) => setGiftEmail(e.target.value)}
            placeholder={t("对方账号邮箱")}
            className="fn-rounded-md fn-border-default fn-py-2.5 fn-px-3 fn-text-md"
            style={{ borderRadius: 10, borderWidth: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, fontSize: 14, backgroundColor: "var(--fn-chip-bg)", borderColor: "var(--fn-border)", color: "var(--fn-text)" }}
          />
          <span className="fn-text-sm fn-text-secondary fn-mt-3.5 fn-mb-1.5" style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            {t("转赠数量（积分）")}
          </span>
          <Input
            value={giftAmount}
            onChange={(e) => setGiftAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={`${MIN_TRANSFER_AMOUNT}+`}
            className="fn-rounded-md fn-border-default fn-py-2.5 fn-px-3 fn-text-md fn-mt-3.5"
            style={{ borderRadius: 10, borderWidth: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, fontSize: 14, backgroundColor: "var(--fn-chip-bg)", borderColor: "var(--fn-border)", color: "var(--fn-text)" }}
          />
          <span className="fn-text-sm fn-text-secondary fn-mt-3.5 fn-mb-1.5" style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            {t("留言（可选）")}
          </span>
          <Input
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value)}
            placeholder={t("给好友说点什么")}
            maxLength={200}
            className="fn-rounded-md fn-border-default fn-py-2.5 fn-px-3 fn-text-md fn-mt-3.5"
            style={{ borderRadius: 10, borderWidth: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, fontSize: 14, backgroundColor: "var(--fn-chip-bg)", borderColor: "var(--fn-border)", color: "var(--fn-text)" }}
          />
          <Button onClick={handleGift} disabled={busy} className="fn-mt-4" style={{ marginTop: 16, paddingTop: 13, paddingBottom: 13, borderRadius: 10, alignItems: "center", backgroundColor: "var(--fn-primary)" }} type="primary">
            <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>{busy ? t("转赠中…") : t("转赠")}</span>
          </Button>
        </div>
      )}

      {tab === "voucher" && (
        <div>
          <span className="fn-text-sm fn-text-tertiary fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "16px" }}>
            {t("生成后可将兑换码发给任意账号核销，生成时从余额扣除，不退还")}
          </span>
          <span className="fn-text-sm fn-text-secondary fn-mt-3.5 fn-mb-1.5" style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            {t("兑换码面额（积分）")}
          </span>
          <Input
            value={voucherAmount}
            onChange={(e) => setVoucherAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={`${MIN_VOUCHER_AMOUNT}+`}
            className="fn-rounded-md fn-border-default fn-py-2.5 fn-px-3 fn-text-md fn-mt-3.5"
            style={{ borderRadius: 10, borderWidth: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, fontSize: 14, backgroundColor: "var(--fn-chip-bg)", borderColor: "var(--fn-border)", color: "var(--fn-text)" }}
          />
          <Button onClick={handleCreateVoucher} disabled={busy} className="fn-mt-4" style={{ marginTop: 16, paddingTop: 13, paddingBottom: 13, borderRadius: 10, alignItems: "center", backgroundColor: "var(--fn-primary)" }} type="primary">
            <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>{busy ? t("生成中…") : t("生成兑换码")}</span>
          </Button>
          {createdVoucher ? (
            <div className="fn-mt-4 fn-rounded-lg fn-border-default fn-bg-chip fn-p-4 fn-items-center" style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-chip-bg)", padding: 16, alignItems: "center" }}>
              <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 13 }}>
                {t("面额 {{amount}} 积分", { amount: createdVoucher.amount })}
              </span>
              <span className="fn-text-2xl fn-font-extrabold fn-tabular-nums fn-text-brand fn-mt-2" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, marginTop: 8 }}>
                {createdVoucher.code}
              </span>
              <span className="fn-text-xs fn-text-tertiary fn-mt-1.5" style={{ fontSize: 12, marginTop: 6 }}>
                {t("有效期至 {{time}}", { time: (createdVoucher.expires_at ?? "").replace("T", " ").slice(0, 10) })}
              </span>
              <Button onClick={handleCopyVoucher} className="fn-mt-4" style={{ marginTop: 16, paddingTop: 13, paddingBottom: 13, borderRadius: 10, alignItems: "center", backgroundColor: "var(--fn-primary)" }} type="primary">
                <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>{t("复制兑换码")}</span>
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {tab === "redeem" && (
        <div>
          <span className="fn-text-sm fn-text-tertiary fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "16px" }}>
            {t("输入好友给你的兑换码，面额到账")}
          </span>
          <span className="fn-text-sm fn-text-secondary fn-mt-3.5 fn-mb-1.5" style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            {t("兑换码")}
          </span>
          <Input
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder={t("输入兑换码")}
            className="fn-rounded-md fn-border-default fn-py-2.5 fn-px-3 fn-text-md fn-mt-3.5 fn-tabular-nums fn-uppercase"
            style={{ borderRadius: 10, borderWidth: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, fontSize: 14, backgroundColor: "var(--fn-chip-bg)", borderColor: "var(--fn-border)", color: "var(--fn-text)", letterSpacing: 3, textTransform: "uppercase" }}
          />
          <Button onClick={handleRedeem} disabled={busy} className="fn-mt-4" style={{ marginTop: 16, paddingTop: 13, paddingBottom: 13, borderRadius: 10, alignItems: "center", backgroundColor: "var(--fn-primary)" }} type="primary">
            <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>{busy ? t("核销中…") : t("核销")}</span>
          </Button>
        </div>
      )}

      <div className="fn-flex fn-items-center fn-gap-1.5 fn-mt-5" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20 }}>
        <Ionicons name="pricetags-outline" size={16} color="var(--fn-primary)" />
        <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 14, fontWeight: 600 }}>
          {t("我的兑换码")}
        </span>
      </div>
      {(!vouchers || vouchers.length === 0) ? (
        <span className="fn-mt-3 fn-text-sm fn-text-center fn-text-tertiary" style={{ marginTop: 12, fontSize: 13, textAlign: "center" }}>
          {t("暂无兑换码")}
        </span>
      ) : (
        <div>
          {vouchers.map((v, idx) => (
            <div
              key={v.id}
              className="fn-flex fn-items-center fn-justify-between fn-py-3 fn-px-1"
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 12,
                paddingBottom: 12,
                paddingLeft: 4,
                paddingRight: 4,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: "var(--fn-divider)",
              }}
            >
              <div className="fn-flex-1 fn-mr-3" style={{ flex: 1, marginRight: 12 }}>
                <span className="fn-text-md fn-font-bold fn-tabular-nums fn-text-primary" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>
                  {v.code}
                </span>
                <span className="fn-text-xs fn-text-tertiary fn-mt-0.75" style={{ fontSize: 12, marginTop: 3 }}>
                  {v.is_expired ? t("已过期") : v.redeemed_at ? t("核销于 {{time}}", { time: v.redeemed_at.replace("T", " ").slice(0, 10) }) : t("有效期至 {{time}}", { time: (v.expires_at ?? "").replace("T", " ").slice(0, 10) })}
                </span>
              </div>
              <div className="fn-flex fn-flex-col fn-items-end" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span className="fn-text-lg fn-font-bold fn-text-brand" style={{ fontSize: 16, fontWeight: 700 }}>
                  {v.amount}
                </span>
                <span className="fn-text-xs fn-mt-0.75" style={{ fontSize: 12, marginTop: 3, color: v.is_expired || v.status === "revoked" ? "var(--fn-text-tertiary)" : v.status === "used" ? "var(--fn-text-secondary)" : "var(--fn-success)" }}>
                  {v.is_expired ? t("已过期") : v.status === "used" ? t("已核销") : v.status === "revoked" ? t("已作废") : t("待核销")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PointsClient() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const loggedIn = !!auth.user;
  const [authVisible, setAuthVisible] = useState(false);

  const { data: points } = useMyPoints(loggedIn);
  const { data: rules } = usePointRules();
  const { data: txPages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMyPointTransactions(loggedIn);

  const transactions = txPages?.pages.flatMap((p) => p.results) ?? [];
  const balance = points?.balance ?? 0;
  const lifetime = points?.lifetime ?? 0;
  const referralCode = points?.referral_code ?? "";
  const referralShareUrl = points?.referral_share_url ?? "";

  useEffect(() => {
    console.log('Updating document title:', t("积分中心"));
    document.title = t("积分中心");
  }, [i18n.language, t]);

  return (
    <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div className="fn-flex fn-items-center fn-justify-between fn-px-5 fn-py-3" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 20, paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.replace("/");
          }}
          className="fn-p-1 fn-cursor-pointer"
          style={{ padding: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="var(--fn-text)" />
        </button>
        <span className="fn-text-xl fn-font-bold fn-text-primary" style={{ fontSize: 17, fontWeight: 700 }}>
          {t("积分中心")}
        </span>
        <div className="fn-w-6" style={{ width: 24 }} />
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px 48px" }}>
        {!loggedIn ? (
          <div className="fn-rounded-lg fn-border-default fn-bg-surface fn-p-5 fn-items-center" style={{ borderRadius: 14, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)", padding: 20, alignItems: "center" }}>
            <div className="fn-mb-3 fn-items-center" style={{ marginBottom: 12, alignItems: "center" }}>
              <Ionicons name="trophy-outline" size={36} color="var(--fn-text-tertiary)" />
            </div>
            <span className="fn-text-md fn-font-semibold fn-text-center fn-text-primary" style={{ fontSize: 16, fontWeight: 600, textAlign: "center" }}>
              {t("登录后查看积分与邀请奖励")}
            </span>
            <span className="fn-text-sm fn-text-center fn-text-tertiary fn-leading-relaxed fn-mt-2" style={{ fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: "16px" }}>
              {t("提交站点、分享教程、提交 APP 链接，审核通过即得积分")}
            </span>
            <Button onClick={() => setAuthVisible(true)} className="fn-mt-5" style={{ marginTop: 20, paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32, borderRadius: 10, backgroundColor: "var(--fn-primary)" }} type="primary">
              <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>
                {t("立即登录 / 注册")}
              </span>
            </Button>
          </div>
        ) : (
          <>
            <div className="fn-rounded-lg fn-border-default fn-bg-surface fn-p-5 fn-items-center fn-py-6.5" style={{ borderRadius: 14, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)", padding: 20, alignItems: "center", paddingTop: 26, paddingBottom: 26 }}>
              <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 13 }}>
                {t("积分余额")}
              </span>
              <span className="fn-text-4xl fn-font-extrabold fn-text-brand fn-mt-1.5" style={{ fontSize: 44, fontWeight: 800, marginTop: 6 }}>
                {balance}
              </span>
              <span className="fn-text-sm fn-text-tertiary fn-mt-1" style={{ fontSize: 13, marginTop: 4 }}>
                {t("累计获得 {{lifetime}} 分", { lifetime })}
              </span>
            </div>

            <div className="fn-mt-4 fn-rounded-lg fn-border-default fn-bg-surface fn-p-5" style={{ marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)", padding: 20 }}>
              <div className="fn-flex fn-items-center fn-gap-2 fn-mb-1.5" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Ionicons name="gift-outline" size={18} color="var(--fn-primary)" />
                <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>
                  {t("邀请好友得积分")}
                </span>
              </div>
<span className="fn-text-sm fn-text-tertiary fn-leading-relaxed" style={{ fontSize: 13, lineHeight: "16px" }}>
                {t("好友通过你的邀请链接注册，你与好友各得奖励积分")}
              </span>
              <div className="fn-mt-3.5 fn-flex fn-items-center fn-justify-between fn-py-2.5 fn-px-3 fn-rounded-md fn-bg-brand-light" style={{ marginTop: 14, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, borderRadius: 10, backgroundColor: "var(--fn-primary-light)" }}>
                <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 13 }}>
                  {t("我的邀请码")}
                </span>
                <span className="fn-text-md fn-font-bold fn-tabular-nums fn-text-primary" style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
                  {referralCode || "—"}
                </span>
              </div>
              <ShareInvite code={referralCode} shareUrl={referralShareUrl} onCopied={() => message.success(t("邀请链接已复制"), 1.5)} />
            </div>

            <div className="fn-mt-5.5" style={{ marginTop: 22 }}>
              <TransferCard />
            </div>

            <div className="fn-flex fn-items-center fn-gap-2 fn-mt-5.5 fn-mb-2.5" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 10 }}>
              <Ionicons name="sparkles-outline" size={18} color="var(--fn-primary)" />
              <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>
                {t("如何赚积分")}
              </span>
            </div>
            <div className="fn-rounded-lg fn-border-default fn-bg-surface fn-pt-1.5 fn-pb-1.5" style={{ borderRadius: 14, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)", paddingTop: 6, paddingBottom: 6 }}>
              {(rules ?? []).map((rule, idx) => (
                <div
                  key={rule.code}
                  className="fn-flex fn-items-center fn-justify-between fn-py-3.5 fn-px-1"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 14,
                    paddingBottom: 14,
                    paddingLeft: 4,
                    paddingRight: 4,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: "var(--fn-divider)",
                  }}
                >
                  <span className="fn-text-md fn-flex-1 fn-text-primary" style={{ fontSize: 14, flex: 1 }}>
                    {rule.name}
                  </span>
                  <div className="fn-ml-2.5" style={{ marginLeft: 10 }}>
                    <span className="fn-text-md fn-font-bold fn-text-brand" style={{ fontSize: 15, fontWeight: 700 }}>
                      +{rule.points}
                    </span>
                  </div>
                </div>
              ))}
              {!rules || rules.length === 0 ? (
                <span className="fn-text-sm fn-text-center fn-text-tertiary" style={{ fontSize: 13, textAlign: "center" }}>
                  {t("暂无积分规则")}
                </span>
              ) : null}
            </div>

            <div className="fn-flex fn-items-center fn-gap-2 fn-mt-5.5 fn-mb-2.5" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 10 }}>
              <Ionicons name="receipt-outline" size={18} color="var(--fn-primary)" />
              <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>
                {t("积分流水")}
              </span>
            </div>
            <div className="fn-rounded-lg fn-border-default fn-bg-surface" style={{ borderRadius: 14, borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)" }}>
              {transactions.length === 0 ? (
                <span className="fn-p-5 fn-text-sm fn-text-center fn-text-tertiary" style={{ padding: 20, fontSize: 13, textAlign: "center" }}>
                  {t("还没有积分记录，快去参与吧")}
                </span>
              ) : (
                <>
                  {transactions.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className="fn-flex fn-items-center fn-justify-between fn-py-3.5 fn-px-1"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 14,
                        paddingBottom: 14,
                        paddingLeft: 4,
                        paddingRight: 4,
                        borderTopWidth: idx > 0 ? 1 : 0,
                        borderTopColor: "var(--fn-divider)",
                      }}
                    >
                      <div className="fn-flex-1 fn-mr-3" style={{ flex: 1, marginRight: 12 }}>
                        <span className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 14, fontWeight: 600 }}>
                          {tx.rule_name || tx.description || tx.ref_type}
                        </span>
                        <span className="fn-text-xs fn-text-tertiary fn-mt-0.75" style={{ fontSize: 12, marginTop: 3 }}>
                          {tx.description}
                        </span>
                        <span className="fn-text-xs fn-text-tertiary fn-mt-0.75" style={{ fontSize: 12, marginTop: 3 }}>
                          {tx.created_at?.replace("T", " ").slice(0, 16)}
                        </span>
                      </div>
                      <div className="fn-flex fn-flex-col fn-items-end" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span className="fn-text-lg fn-font-bold" style={{ fontSize: 16, fontWeight: 700, color: tx.amount >= 0 ? "var(--fn-success)" : "var(--fn-error)" }}>
                          {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                        </span>
                        <span className="fn-text-xs fn-text-tertiary fn-mt-0.75" style={{ fontSize: 12, marginTop: 3 }}>
                          {t("余额 {{balance}}", { balance: tx.balance_after })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {hasNextPage ? (
                    <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="fn-mt-2 fn-border-t fn-pt-3.5 fn-flex fn-items-center" style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "var(--fn-border)", paddingTop: 14, paddingBottom: 14, alignItems: "center", borderColor: "var(--fn-border)" }} type="default">
                      <span className="fn-text-md fn-font-semibold fn-text-brand" style={{ fontSize: 14, fontWeight: 600 }}>
                        {isFetchingNextPage ? t("加载中…") : t("加载更多")}
                      </span>
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={(email, password, captcha) => auth.login(email, password, captcha)}
        onRegister={(email, password, captcha) => auth.register(email, password, captcha)}
        onVerify={(email, code, password) => auth.verify(email, code, password)}
        onRequestReset={(email) => auth.requestPasswordReset(email)}
        onResetPassword={(email, code, password) => auth.resetPassword(email, code, password)}
      />
    </div>
  );
}