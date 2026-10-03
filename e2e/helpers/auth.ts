import { expect, type Browser, type Page } from "@playwright/test";

export type E2ERole = "editor" | "contributor" | "reader";

export type SignedIn = { page: Page; id: string; email: string; role: E2ERole };

// Signs in through the test-only session route. The request shares the page's cookie jar.
export async function signIn(browser: Browser, role: E2ERole): Promise<SignedIn> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.request.post("/api/e2e/session", { data: { role } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { id: string; email: string; role: E2ERole };
  return { page, id: body.id, email: body.email, role: body.role };
}
