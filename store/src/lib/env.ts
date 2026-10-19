import { z } from "zod";

/**
 * Environment configuration, validated on first use.
 * See .env.example for descriptions of every variable.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  CRON_SECRET: z.string().min(24),

  PAYMENTS_PROVIDER: z.enum(["razorpay", "mock"]).default("razorpay"),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  SHIPPING_PROVIDER: z.enum(["shiprocket", "mock"]).default("shiprocket"),
  SHIPROCKET_EMAIL: z.string().default(""),
  SHIPROCKET_PASSWORD: z.string().default(""),
  SHIPROCKET_PICKUP_LOCATION: z.string().default(""),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().default(""),

  EMAIL_TRANSPORT: z.enum(["smtp", "log"]).default("log"),
  SMTP_URL: z.string().default(""),
  EMAIL_FROM: z.string().default("The Farm Door <orders@thefarmdoor.com>"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  /** Allows simulated payment/shipping providers outside development. Never set this on the live site. */
  ALLOW_MOCK_PROVIDERS: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;
  const mocks = value.PAYMENTS_PROVIDER === "mock" || value.SHIPPING_PROVIDER === "mock";
  if (mocks && value.NODE_ENV === "production" && value.ALLOW_MOCK_PROVIDERS !== "true") {
    throw new Error(
      "Simulated (mock) payment or shipping providers are configured in production. " +
        "Set PAYMENTS_PROVIDER=razorpay and SHIPPING_PROVIDER=shiprocket for the live site.",
    );
  }
  if (value.NODE_ENV === "production" && !value.APP_URL.startsWith("https://") && !/^http:\/\/localhost(:\d+)?$/.test(value.APP_URL)) {
    throw new Error("APP_URL must use https:// on the live site.");
  }
  if (value.EMAIL_TRANSPORT === "smtp" && !value.SMTP_URL) {
    throw new Error("EMAIL_TRANSPORT=smtp requires SMTP_URL");
  }
  cached = value;
  return value;
}

export function isMockPayments() {
  return env().PAYMENTS_PROVIDER === "mock";
}

export function isMockShipping() {
  return env().SHIPPING_PROVIDER === "mock";
}

/** True when any part of checkout is simulated or uses Razorpay test keys. Drives the TEST MODE banner. */
export function testModeReasons(): string[] {
  const e = env();
  const reasons: string[] = [];
  if (e.PAYMENTS_PROVIDER === "mock") reasons.push("payments are simulated");
  else if (e.RAZORPAY_KEY_ID.startsWith("rzp_test_")) reasons.push("Razorpay is in test mode");
  if (e.SHIPPING_PROVIDER === "mock") reasons.push("shipping rates are simulated");
  if (e.EMAIL_TRANSPORT === "log") reasons.push("emails are logged, not sent");
  return reasons;
}
