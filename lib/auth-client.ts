/**
 * Better Auth client — talks to botcortex-api (NEXT_PUBLIC_API_URL).
 * Cookies ride cross-origin; the api's TRUSTED_ORIGINS must list this app.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787",
});

export const { useSession, signIn, signUp, signOut } = authClient;
