import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  /**
   * Route the Firestore Admin imports to the Supabase-backed compatibility shim,
   * so the entire codebase keeps using the Firestore API while data lives in Postgres.
   */
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "firebase-admin/firestore": path.resolve(
        __dirname,
        "lib/supabase/firebase-admin-firestore.ts"
      ),
      // The `firebase` client package was removed; the only remaining importers are
      // the out-of-scope mover-profile components. Alias to a throwing stub so the
      // app still bundles (mover Firebase auth is dead until reimplemented on Supabase).
      "firebase/auth": path.resolve(__dirname, "lib/firebase/authStub.ts"),
      "firebase/app": path.resolve(__dirname, "lib/firebase/authStub.ts"),
    };
    return config;
  },
  /**
   * אם תרצה בעתיד להטמיע ב-Elementor/iframe תחת נתיב ייעודי (כמו שעשינו בדשבורד אפיליאייט),
   * נוכל לאפשר frame-ancestors לנתיב הזה.
   */
  async headers() {
    return [
      {
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

