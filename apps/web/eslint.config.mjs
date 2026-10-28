import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// UptimeFlare's code is kept as upstream wrote it; the rules eslint-config-next
// 16 brings that it was not written against are turned off by name, each with
// the reason, rather than rewriting the template.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // worker.ts imports the generated `.open-next/worker.js` the way the
      // OpenNext custom-worker howto does: `@ts-ignore` with a reason, because
      // the file does not exist before the build. Upstream's state code uses
      // `@ts-expect-error` for Uint8Array.fromHex/toHex, which the DOM lib
      // does not type yet.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description", "ts-expect-error": false },
      ],
      // Upstream types much of its state and API plumbing as `any`.
      "@typescript-eslint/no-explicit-any": "off",
      // …and declares with `let` what it never reassigns.
      "prefer-const": "off",
      // The status components read the clock while they render (the uptime
      // bars and percentages are relative to now), as upstream's do; the
      // whole page renders in the browser only (NoSsr), so no server and
      // client render can disagree about it.
      "react-hooks/purity": "off",
    },
  },
  {
    // DetailBar loads moment and its precise-range plugin with require(), as
    // upstream does (the plugin patches moment in place).
    files: ["components/DetailBar.tsx", "postcss.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // .wrangler holds the bundles `wrangler dev` writes; never source.
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "next-env.d.ts", "cloudflare-env.d.ts"]),
]);
