import { z } from "zod";
import { usernameSchema } from "./user";

// Password policy: bcrypt silently truncates beyond 72 bytes, so 72 is a hard
// cap, not a style choice. Minimum length + one letter + one digit is a
// sensible baseline without being a UX obstacle course.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// The current user's own profile — email is appropriate here (it's their own
// account), unlike publicUserSchema (@taskflow/shared user.ts) which is what
// *other* users see and deliberately omits it.
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  username: z.string(),
  bio: z.string().nullable(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const BIO_MAX_LENGTH = 160;

// PATCH-style: omitted fields are left untouched; bio may be explicitly set
// to null to clear it. At least one field must be present, same convention
// as updateTaskRequestSchema (packages/shared/src/schemas/task.ts).
export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    bio: z
      .string()
      .trim()
      .max(BIO_MAX_LENGTH, `Bio must be at most ${BIO_MAX_LENGTH} characters`)
      .nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
  username: usernameSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

// Logout takes the same shape as refresh (the token being revoked).
export const logoutRequestSchema = refreshRequestSchema;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userProfileSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
