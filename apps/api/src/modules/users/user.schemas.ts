import { z } from "zod";

export const roleNameSchema = z.enum(["Super Admin", "Admin", "Manager", "Editor", "Member", "Viewer"]);
const userStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  avatar: z.string().url().max(2048).nullable().optional(),
  jobTitle: z.string().trim().max(100).nullable().optional(),
  role: roleNameSchema.default("Member")
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email().max(254),
  role: roleNameSchema.default("Member")
});

export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .optional()
});

export const updateOrganizationUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    avatar: z.string().url().max(2048).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    status: userStatusSchema.optional(),
    memberStatus: userStatusSchema.optional(),
    role: roleNameSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
