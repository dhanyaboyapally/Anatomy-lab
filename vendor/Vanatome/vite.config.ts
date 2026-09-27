import vinext from "vinext";
import { defineConfig } from "vite";

// Windows file events can leave Vinext's Cloudflare worker in a stale HMR
// state after a source change, so use polling by default on that platform.
const usePolling =
  process.env.VANATOME_USE_POLLING === "true" ||
  (process.platform === "win32" && process.env.VANATOME_USE_POLLING !== "false");

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    optimizeDeps: {
      include: ["three", "@react-three/fiber", "@react-three/drei"],
      exclude: ["@ai-sdk/google"],
    },
    ssr: {
      optimizeDeps: {
        include: ["three", "@react-three/fiber", "@react-three/drei"],
        exclude: ["@ai-sdk/google"],
      },
    },
    server: usePolling
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
