import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const missing = () => new NextResponse("Not found", { status: 404 });

export function GET() {
  return missing();
}

export async function POST(request: Request) {
  // require() inside the comparison, not import(): esbuild and webpack keep a dynamic
  // import() even after the branch is dead. next.config inlines E2E_FULL as "" for a
  // production build, which drops this module.
  if (process.env.E2E_FULL === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createE2ESession } = require("../../../../lib/e2e/session") as typeof import("@/lib/e2e/session");
    return createE2ESession(request);
  }
  return missing();
}
