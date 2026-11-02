import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Architecture boundary: the scanner/db/playbooks layer and the worker
    // must stay framework-free so both the web app and the worker can use them.
    files: ["src/core/**/*.{ts,tsx}", "src/worker/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message: "src/core and src/worker must not import from Next.js.",
            },
            {
              group: ["@/app/*", "@/components/*"],
              message: "src/core and src/worker must not import from the UI layers.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;