/**
 * Better Auth client — same-origin: next.config rewrites proxy /api/auth/*
 * to botcortex-api, so session cookies are first-party on the app's domain.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
