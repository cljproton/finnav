// 全局 Worker 绑定类型定义
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  QUOTA: DurableObjectNamespace<import("./do/quota").QuotaGuard>;
  APP_ENV: string;
  // P3+ 逐步补充：JWT_SECRET、RESEND_API_KEY 等 secret
}

export interface ErrorBody {
  code: string;
  detail: string;
}
