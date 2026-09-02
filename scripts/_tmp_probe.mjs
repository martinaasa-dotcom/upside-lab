import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
page.on("response", (r) => {
  if (!r.url().includes("_next") && r.status() >= 400)
    console.log("HTTP", r.status(), r.url().slice(0, 120));
});
await page.addInitScript(() => {
  localStorage.setItem("portfell-welcome-tour", "99");
  localStorage.setItem("upside-analytics-consent", "declined");
  localStorage.setItem(
    "upside-last-user-v1",
    JSON.stringify({ id: "u1", email: "u1@example.com" })
  );
});
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/supabase\.co/.test(url)) {
    const user = {
      id: "u1",
      aud: "authenticated",
      role: "authenticated",
      email: "u1@example.com",
      app_metadata: {},
      user_metadata: { full_name: "Martin Aasa" },
      created_at: "2026-01-01T00:00:00Z",
    };
    console.log("SUPA", url.slice(0, 100));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.includes("/user") ? user : { user }),
    });
  }
  if (url.includes("/api/auth/me")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          id: "u1",
          email: "u1@example.com",
          display_name: "Martin Aasa",
          avatar_url: null,
        },
      }),
    });
  }
  return route.continue();
});
await page.goto("http://localhost:3188/communities", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log(
  "TEXT",
  (await page.evaluate(() => document.body.innerText)).slice(0, 300)
);
console.log(
  "session hint",
  await page.evaluate(() => document.documentElement.getAttribute("data-session"))
);
await browser.close();
