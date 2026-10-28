import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../apps/web/"),
      // The Workers runtime's TCP sockets: a stand-in the tests drive
      // (stubs/cloudflare-sockets.ts), since Node has no such module.
      "cloudflare:sockets": path.resolve(__dirname, "stubs/cloudflare-sockets.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // Uint8Array.fromHex / toHex, which the compacted state uses and the
    // Workers runtime has; Node 22 does not.
    setupFiles: ["stubs/uint8array-hex.ts"],
  },
});
