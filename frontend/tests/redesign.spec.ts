import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => sessionStorage.setItem("credem-mode", "demo"));
});

test("mobile navigation opens and closes after choosing a destination", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Meniu", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(page.getByRole("button", { name: "Închide" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("navigation", { name: "Navigare principală" }).getByRole("link", { name: "Meniul familiei" }).click();
  await expect(page).toHaveURL(/\/familie$/);
  await expect(page.getByRole("button", { name: "Meniu", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("category pills and quantity controls update the existing cart", async ({ page }) => {
  await page.goto("/catalog");
  const category = page.getByRole("button", { name: "meal_plan", exact: true });
  await category.click();
  await expect(category).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mărește cantitatea pentru Plan de mese pentru 3 zile" }).click();
  await page.getByRole("button", { name: "Adaugă Plan de mese pentru 3 zile în coș" }).click();
  await expect(page.getByRole("link", { name: "Coș: 2 produse" })).toBeVisible();
});

test("unavailable product images display the fallback", async ({ page }) => {
  await page.route("**/images/examples/*", route => route.abort());
  await page.goto("/planuri");
  await expect(page.getByRole("button", { name: "Vezi Plan de mese pentru 3 zile" }).getByText("PRODUS ILUSTRATIV")).toBeVisible();
});
