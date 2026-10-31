import { test, expect, type Page } from "@playwright/test";

const product = {
  id: 1,
  name: "Plan test",
  description: "Produs test",
  category: "plan",
  price_bani: 65000,
  storage_type: "chilled",
  available: true,
  demo_only: false,
  sku: null,
  product_type: "meal_plan",
  unit: "pack",
  net_weight_g: null,
  preparation_type: null,
  ingredients: null,
  allergens: null,
  shelf_life_days: null,
  preparation_instructions: null,
  supplier: "Test",
  image_preview_url: null,
};
const frozen = {
  ...product,
  id: 2,
  name: "Produs congelat",
  category: "congelate",
  product_type: "individual_dish",
  storage_type: "frozen",
};
const zone = {
  id: 1,
  city: "Chișinău",
  name: "Rîșcani",
  neighborhood: "Rîșcani",
  active: true,
  parent_zone_id: null,
  minimum_basket_bani: 60000,
  delivery_fee_bani: 0,
};
const windowData = {
  id: 1,
  zone_id: 1,
  delivery_at: "2099-01-03T12:00:00Z",
  ordering_cutoff: "2099-01-02T12:00:00Z",
};
type State = {
  products: object[];
  zones: object[];
  windows: object[];
  postStatus: number;
  posts: number;
};
async function mockPublic(page: Page, state: State) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/products")
      return route.fulfill({ json: state.products });
    if (url.pathname === "/api/delivery-zones")
      return route.fulfill({ json: state.zones });
    if (url.pathname === "/api/delivery-windows")
      return route.fulfill({ json: state.windows });
    if (url.pathname === "/api/orders" && route.request().method() === "POST") {
      state.posts++;
      return route.fulfill({
        status: state.postStatus,
        json:
          state.postStatus === 201
            ? {
                id: 42,
                subtotal_bani: 65000,
                delivery_fee_bani: 0,
                total_bani: 65000,
                status: "requested",
              }
            : { detail: "Try again" },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
}
function state(): State {
  return {
    products: [product, frozen],
    zones: [zone],
    windows: [windowData],
    postStatus: 201,
    posts: 0,
  };
}
async function checkout(page: Page) {
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  await page.getByRole("link", { name: /Coș:/ }).click();
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(
    page.getByLabel("Interval de livrare").locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
}

test("category filter, quantities and mixed storage are reflected in the cart", async ({
  page,
}) => {
  const data = state();
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByLabel("Categorie").selectOption("plan");
  await expect(
    page.getByRole("button", { name: "Adaugă Produs congelat în coș" }),
  ).toHaveCount(0);
  await page.getByLabel("Cantitate pentru Plan test").fill("2");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  await expect(
    page.getByRole("link", { name: "Coș: 2 produse" }),
  ).toBeVisible();
  await page.getByLabel("Categorie").selectOption("congelate");
  await page
    .getByRole("button", { name: "Adaugă Produs congelat în coș" })
    .click();
  await expect(page.getByRole("status")).toContainText("temperaturi diferite");
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Coș: 2 produse" }),
  ).toBeVisible();
});

test("demo mode and simulated confirmation survive refresh without posting", async ({
  page,
}) => {
  const data = state();
  await mockPublic(page, data);
  await page.goto("/");
  await page.getByRole("button", { name: "Încearcă demo" }).click();
  await page.goto("/planuri");
  await page
    .getByRole("button", { name: "Adaugă Plan de mese pentru 3 zile în coș" })
    .click();
  await page.reload();
  await expect(
    page.getByText("Mod demonstrativ", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Coș:/ }).click();
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("9001");
  await expect(
    page.getByLabel("Interval de livrare").locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("9001");
  await page.getByRole("button", { name: "Simulează cererea" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cerere simulată trimisă" }),
  ).toBeVisible();
  expect(data.posts).toBe(0);
});

for (const invalid of ["product", "price", "zone", "window"] as const) {
  test(`checkout rejects stale ${invalid} without clearing the cart`, async ({
    page,
  }) => {
    const data = state();
    await mockPublic(page, data);
    await checkout(page);
    if (invalid === "product") data.products = [frozen];
    if (invalid === "price")
      data.products = [{ ...product, price_bani: 70000 }, frozen];
    if (invalid === "zone") data.zones = [];
    if (invalid === "window") data.windows = [];
    await page.getByRole("button", { name: "Trimite cererea" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(data.posts).toBe(0);
    await page.getByRole("link", { name: /Coș:/ }).click();
    await expect(page.getByText("Plan test", { exact: true })).toBeVisible();
    if (invalid === "price")
      await expect(page.locator(".cart-summary")).toContainText("700");
  });
}

test("failed order preserves cart; successful receipt survives refresh", async ({
  page,
}) => {
  const data = state();
  data.postStatus = 422;
  await mockPublic(page, data);
  await checkout(page);
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("Verifică datele");
  await expect(
    page.getByRole("link", { name: "Coș: 1 produse" }),
  ).toBeVisible();
  data.postStatus = 201;
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toContainText("#42");
  await page.reload();
  await expect(page.locator(".receipt")).toContainText("#42");
});
