import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Plain Vite config for TanStack Start (no Lovable wrapper).
//
// Deploy target: nitro auto-detects the host (Vercel, Netlify, Cloudflare, ...) and
// falls back to a Node server locally. Force one with the NITRO_PRESET env var,
// e.g. NITRO_PRESET=vercel or NITRO_PRESET=cloudflare-module.
// Browser security headers for every response (audit M2): no framing (clickjacking),
// no MIME sniffing, a Content-Security-Policy limited to this site, Google Fonts and
// Supabase, and the microphone only for this site (lecture transcription).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // TanStack Start inlines its hydration data; pdf.js needs WebAssembly for some images.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
  // PDF Studio's converter makes the exact PDF copy of uploaded PowerPoint decks.
  "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co https://pdf-studio-api-xy4g.onrender.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  // PDF Studio (merge, split, convert PDFs) is embedded in My notes.
  "frame-src 'self' blob: https://pdfstudioapp.vercel.app",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

export default defineConfig(({ command, mode }) => {
  // Expose VITE_* vars to both the client and SSR bundles.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: true, port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Fail the build if client code imports server-only modules.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Use src/server.ts (SSR error wrapper) as the server entry.
        server: { entry: "server" },
      }),
      ...(command === "build"
        ? [nitro({ routeRules: { "/**": { headers: SECURITY_HEADERS } } })]
        : []),
      viteReact(),
    ],
  };
});
