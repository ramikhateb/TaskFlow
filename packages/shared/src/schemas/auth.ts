import { z } from "zod";

// Password policy: bcrypt silently truncates beyond 72 bytes, so 72 is a hard
// cap, not a style choice. Minimum length + one letter + one digit is a
// sensible baseline without being a UX obstacle course.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
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
