import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
      tier: string;
      is_superadmin: boolean;
    };
  }
  interface User {
    tier: string;
    accessToken: string;
    is_superadmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tier: string;
    accessToken: string;
    is_superadmin: boolean;
    /** Unix ms — when tier was last confirmed from the DB. Used for auto-refresh. */
    tierCheckedAt?: number;
  }
}
