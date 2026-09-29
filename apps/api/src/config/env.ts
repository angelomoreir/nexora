import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// override: true — the project .env is authoritative over ambient environment
// variables (e.g. a machine-level OPENAI_API_KEY from another tool).
config({ path: process.env.DOTENV_CONFIG_PATH ?? fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true, override: true });

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const optionalEnvironmentString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    APP_URL: z.string().url().default("http://localhost:5173"),
    API_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1).default("file:./dev.db"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_ROOT: z.string().min(1).default("./storage"),
    S3_ENDPOINT: optionalEnvironmentString,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: optionalEnvironmentString,
    S3_ACCESS_KEY_ID: optionalEnvironmentString,
    S3_SECRET_ACCESS_KEY: optionalEnvironmentString,
    S3_FORCE_PATH_STYLE: booleanFromEnvironment,
    DOCUMENT_MAX_SIZE_BYTES: z.coerce.number().int().positive().max(104_857_600).default(26_214_400),
    JWT_ACCESS_SECRET: z.string().min(32).default("local-development-access-secret-change-me"),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    SMTP_HOST: optionalEnvironmentString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromEnvironment,
    SMTP_USER: optionalEnvironmentString,
    SMTP_PASSWORD: optionalEnvironmentString,
    MAIL_FROM: z.string().email().default("no-reply@nexora.local"),
    MAIL_CONSOLE_ENABLED: booleanFromEnvironment,
    EXPOSE_PASSWORD_RESET_TOKEN: booleanFromEnvironment,
    STRIPE_SECRET_KEY: optionalEnvironmentString,
    STRIPE_WEBHOOK_SECRET: optionalEnvironmentString,
    STRIPE_PRICE_MAP: optionalEnvironmentString,
    AI_PROVIDER: z.enum(["local", "openai"]).default("local"),
    OPENAI_API_KEY: optionalEnvironmentString,
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini")
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.JWT_ACCESS_SECRET === "local-development-access-secret-change-me") {
      context.addIssue({ code: "custom", path: ["JWT_ACCESS_SECRET"], message: "A production JWT secret is required" });
    }
    if (value.NODE_ENV === "production" && value.EXPOSE_PASSWORD_RESET_TOKEN) {
      context.addIssue({ code: "custom", path: ["EXPOSE_PASSWORD_RESET_TOKEN"], message: "Reset tokens cannot be exposed in production" });
    }
  });

export const env = envSchema.parse(process.env);

process.env.DATABASE_URL = env.DATABASE_URL;
