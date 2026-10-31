import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const width of [390, 768, 1440]) {
  test(`family wizard stages fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/products", route => route.fulfill({ json: [{ id: 1, name: "Preparat test", description: "Mâncare de test", category: "mese", price_bani: 60000, storage_type: "chilled", available: true, demo_only: false, fulfillment_group: "meals", preparation_level: "ready", product_type: "individual_dish", unit: "porție", image_preview_url: null }] }));
    const directory = "/tmp/credem-family-screenshots";
    mkdirSync(directory, { recursive: true });
    const capture = async (stage: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
      await page.screenshot({ path: `${directory}/${width}-${stage}.png`, fullPage: true });
    };
    await page.goto("/familie");
    await page.getByRole("heading", { name: "Cine va mânca?" }).waitFor();
    await capture("members");
    await page.getByRole("button", { name: "Continuă → Alege zilele" }).click();
    await capture("days");
    await page.getByRole("button", { name: "Continuă → Alege mesele" }).click();
    await capture("meals");
    const breakfast = page.locator(".family-slot").filter({ has: page.getByRole("heading", { name: "Mic dejun", exact: true }) });
    await breakfast.getByRole("button", { name: "Adaugă preparat" }).click();
    await breakfast.getByRole("button", { name: "Adaugă Preparat test" }).click();
    await capture("picker");
    await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
    await capture("overview");
  });
}
