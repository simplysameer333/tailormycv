import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9000";
const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleEnabled
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        })]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            tier: data.user.tier,
            is_superadmin: data.user.is_superadmin ?? false,
            accessToken: data.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          const res = await fetch(`${API_URL}/api/auth/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              google_id: account.providerAccountId,
              provider: "google",
            }),
          });
          if (!res.ok) return false;
          const data = await res.json();
          user.id = data.user.id;
          user.tier = data.user.tier;
          user.is_superadmin = data.user.is_superadmin ?? false;
          user.accessToken = data.access_token;
        } catch {
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      // Initial sign-in: populate from the login/sync response
      if (user) {
        token.id = user.id;
        token.tier = user.tier;
        token.is_superadmin = user.is_superadmin ?? false;
        token.accessToken = user.accessToken;
        token.tierCheckedAt = Date.now();
        return token;
      }

      // Subsequent session checks: re-fetch tier from DB every 5 minutes.
      // This ensures tier changes made by admin are reflected without re-login.
      const TIER_TTL_MS = 5 * 60 * 1000; // 5 minutes
      const stale = Date.now() - (token.tierCheckedAt ?? 0) > TIER_TTL_MS;

      if (stale && token.accessToken) {
        try {
          const res = await fetch(`${API_URL}/api/account/me`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
            cache: "no-store",
          });
          if (res.ok) {
            const me = await res.json();
            token.tier = me.tier;
            token.is_superadmin = me.is_superadmin;
            token.tierCheckedAt = Date.now();
          }
        } catch {
          // Network error — keep existing tier, try again next interval
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id;
      session.user.tier = token.tier;
      session.user.is_superadmin = token.is_superadmin ?? false;
      session.accessToken = token.accessToken;
      return session;
    },
  },

  pages: {
    signIn: "/auth/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
};
