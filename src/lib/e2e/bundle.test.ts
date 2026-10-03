import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "../../..");

async function bundle(entry: string, flag: '""' | '"1"') {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    define: {
      "process.env.E2E_FULL": flag,
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [
      {
        name: "externalize",
        setup(build) {
          build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "stub" }));
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export {}", loader: "js" }));
          build.onResolve({ filter: /^@\// }, (args) => {
            const base = path.join(root, "src", args.path.slice(2));
            const file = ["", ".ts", ".tsx", ".js"].map((suffix) => base + suffix).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
            return { path: file ?? base };
          });
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === "entry-point") return null;
            if (args.path.startsWith(".") || args.path.startsWith("node:") || path.isAbsolute(args.path)) return null;
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });
  return result.outputFiles[0]?.text ?? "";
}

test("a production build does not contain the e2e session helper", async () => {
  const off = await bundle("src/app/api/e2e/session/route.ts", '""');
  assert.equal(off.includes("e2e-only-password"), false);
  assert.equal(off.includes("signInWithPassword"), false);

  const on = await bundle("src/app/api/e2e/session/route.ts", '"1"');
  assert.equal(on.includes("e2e-only-password"), true);
  assert.equal(on.includes("signInWithPassword"), true);
});

test("a production build does not contain the e2e Stripe double", async () => {
  const off = await bundle("src/lib/membership/stripe.ts", '""');
  assert.equal(off.includes("checkout.stripe.test"), false);

  const on = await bundle("src/lib/membership/stripe.ts", '"1"');
  assert.equal(on.includes("checkout.stripe.test"), true);
});
