export const CATEGORY_ICON_MAP: Record<string, string> = {
  defi: "🦄",
  exchange: "🏦",
  wallet: "👛",
  market: "📈",
  broker: "📊",
  bank: "🏛️",
  ucard: "💳",
  explorer: "🔭",
  analytics: "🧮",
  payment: "💰",
};

export function getCategoryIcon(slug: string): string {
  return CATEGORY_ICON_MAP[slug] || "🏷️";
}

export function getCategoryName(slug: string): string {
  const names: Record<string, string> = {
    defi: "DeFi",
    exchange: "交易所",
    wallet: "钱包",
    market: "行情资讯",
    broker: "海外券商",
    bank: "海外银行",
    ucard: "U卡",
    explorer: "区块链浏览器",
    analytics: "数据分析",
    payment: "支付收款",
  };
  return names[slug] || slug;
}