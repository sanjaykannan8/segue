import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep file tracing inside this app, even when a parent folder has its own lockfile.
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: { root: path.resolve(__dirname) },
  // The browser calls the API through this app (/api/...), so one address serves both: it works on
  // localhost, behind a tunnel such as ngrok, and over HTTPS, with same-origin cookies and no CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://api:8000"}/:path*` }];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Next.js starts the page with small inline scripts
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [{
      source: "/((?!api/).*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }, // the boarding pass scanner uses the camera
      ],
    }];
  },
  // Compression would buffer the live update stream (server-sent events).
  compress: false,
};

export default nextConfig;
