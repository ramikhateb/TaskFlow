import type { RefreshToken, User } from "@prisma/client";
import type { AuthResponse, LoginRequest, RegisterRequest, UserProfile } from "@taskflow/shared";
import type { Env } from "../env";
import { ConflictError, NotFoundError, UnauthenticatedError } from "../errors";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  generateFamilyId,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../lib/tokens";

// Narrow interfaces (matching the repository modules' shape) so this service
// can be unit tested against fakes, with no Prisma import here at all.
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: { email: string; passwordHash: string; name: string }): Promise<User>;
}

export interface RefreshTokenRepository {
  create(data: {
    tokenHash: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<RefreshToken>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<RefreshToken>;
  revokeFamily(familyId: string): Promise<{ count: number }>;
}

export interface AuthServiceDeps {
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
  env: Pick<Env, "JWT_ACCESS_SECRET" | "JWT_ACCESS_TTL_SECONDS" | "REFRESH_TOKEN_TTL_DAYS">;
}

const GENERIC_LOGIN_ERROR = "Invalid email or password";

function toUserProfile(user: User): UserProfile {
  return { id: user.id, email: user.email, name: user.name };
}

export function createAuthService({
  userRepository,
  refreshTokenRepository,
  env,
}: AuthServiceDeps) {
  async function issueTokenPair(
    userId: string,
    familyId: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const rawRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await refreshTokenRepository.create({
      tokenHash: hashRefreshToken(rawRefreshToken),
      userId,
      familyId,
      expiresAt,
    });

    return { accessToken: signAccessToken(userId, env), refreshToken: rawRefreshToken };
  }

  async function register(input: RegisterRequest): Promise<AuthResponse> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      // Deliberately distinct from login's generic message (EC-10): this is
      // registration, where confirming "you already have an account" is
      // expected UX, not an enumeration risk.
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      name: input.name,
    });

    const { accessToken, refreshToken } = await issueTokenPair(user.id, generateFamilyId());
    return { accessToken, refreshToken, user: toUserProfile(user) };
  }

  async function login(input: LoginRequest): Promise<AuthResponse> {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
    }

    const { accessToken, refreshToken } = await issueTokenPair(user.id, generateFamilyId());
    return { accessToken, refreshToken, user: toUserProfile(user) };
  }

  async function refresh(rawRefreshToken: string): Promise<AuthResponse> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const record = await refreshTokenRepository.findByTokenHash(tokenHash);

    if (!record) {
      throw new UnauthenticatedError("Invalid refresh token");
    }

    if (record.revokedAt) {
      // EC-9: this token was already rotated out (or logged out) — someone is
      // presenting a dead credential. Revoke the whole family as a precaution.
      await refreshTokenRepository.revokeFamily(record.familyId);
      throw new ConflictError("Refresh token reuse detected; session revoked");
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthenticatedError("Refresh token expired");
    }

    const user = await userRepository.findById(record.userId);
    if (!user) {
      throw new UnauthenticatedError("Invalid refresh token");
    }

    // Rotate: retire this token, mint a new one in the same family.
    await refreshTokenRepository.revoke(record.id);
    const { accessToken, refreshToken } = await issueTokenPair(user.id, record.familyId);
    return { accessToken, refreshToken, user: toUserProfile(user) };
  }

  async function logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const record = await refreshTokenRepository.findByTokenHash(tokenHash);

    // Idempotent: an unknown or already-revoked token means the session is
    // already effectively logged out, which isn't an error for the caller.
    if (!record || record.revokedAt) {
      return;
    }

    await refreshTokenRepository.revoke(record.id);
  }

  async function getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return toUserProfile(user);
  }

  return { register, login, refresh, logout, getProfile };
}

export type AuthService = ReturnType<typeof createAuthService>;
