import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");
const name = z.string().trim().min(2).max(100);

export const registerSchema = z.object({
  name,
  email,
  password,
  organizationName: z.string().trim().min(2).max(120)
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(256), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const updateProfileSchema = z.object({
  name: name.optional(),
  avatar: z.string().url().max(2048).nullable().optional(),
  jobTitle: z.string().trim().max(100).nullable().optional()
});
