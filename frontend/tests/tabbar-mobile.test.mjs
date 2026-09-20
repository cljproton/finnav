import { test, expect } from "@playwright/test";

test.describe("TabBar mobile visibility", () => {
  test("TabBar should be visible on mobile (375px width)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForLoadState("domcontentloaded");

    const tabBar = page.locator(".fn-show-mobile").first();

    const displayValue = await tabBar.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });
    console.log(`Mobile TabBar computed display: ${displayValue}`);

    const isVisible = await tabBar.isVisible();
    console.log(`Mobile TabBar is visible: ${isVisible}`);

    const boundingBox = await tabBar.boundingBox();
    console.log(`Mobile TabBar bounding box:`, boundingBox);

    await page.screenshot({ path: "tabbar-mobile.png", fullPage: true });

    expect(displayValue).toBe("flex");
    expect(isVisible).toBe(true);
    expect(boundingBox).not.toBeNull();
    expect(boundingBox.height).toBeGreaterThan(0);
  });
});