import { test, expect } from "@playwright/test";

test.describe("TabBar desktop visibility", () => {
  test("TabBar should be hidden on desktop (1200px width)", async ({ page }) => {
    // Set viewport to desktop width
    await page.setViewportSize({ width: 1200, height: 800 });

    // Navigate to the homepage
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

    // Wait for the page to load
    await page.waitForLoadState("domcontentloaded");

    // Find the TabBar element
    const tabBar = page.locator(".fn-show-mobile").first();

    // Check if TabBar exists in DOM
    const exists = await tabBar.count();
    console.log(`TabBar elements found: ${exists}`);

    if (exists > 0) {
      // Get computed display value
      const displayValue = await tabBar.evaluate((el) => {
        return window.getComputedStyle(el).display;
      });
      console.log(`TabBar computed display: ${displayValue}`);

      // Check visibility
      const isVisible = await tabBar.isVisible();
      console.log(`TabBar is visible: ${isVisible}`);

      // Get bounding box to verify it's actually hidden
      const boundingBox = await tabBar.boundingBox();
      console.log(`TabBar bounding box:`, boundingBox);

      // Take screenshot
      await page.screenshot({ path: "tabbar-desktop.png", fullPage: true });
      console.log("Screenshot saved as tabbar-desktop.png");

      // Verify TabBar is hidden on desktop
      expect(displayValue).toBe("none");
      expect(isVisible).toBe(false);
    } else {
      console.log("TabBar element not found in DOM");
      await page.screenshot({ path: "tabbar-desktop.png", fullPage: true });
      throw new Error("TabBar element not found");
    }
  });

  test("Check for CSS loading issues", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

    // Check for failed CSS requests
    const failedRequests = [];
    page.on("response", (response) => {
      if (response.url().includes(".css") && response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.waitForLoadState("networkidle");

    console.log("Failed CSS requests:", failedRequests);
    expect(failedRequests.length).toBe(0);

    // Check if CSS variables are loaded
    const cssVars = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        primary: styles.getPropertyValue("--fn-primary"),
        tabbar: styles.getPropertyValue("--fn-tabbar"),
        tabbarBorder: styles.getPropertyValue("--fn-tabbar-border"),
      };
    });
    console.log("CSS variables:", cssVars);

    // Verify CSS variables have values
    expect(cssVars.primary).not.toBe("");
    expect(cssVars.tabbar).not.toBe("");
    expect(cssVars.tabbarBorder).not.toBe("");
  });
});