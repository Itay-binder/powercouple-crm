import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
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

