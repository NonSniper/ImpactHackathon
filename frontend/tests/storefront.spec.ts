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
  failProducts?: boolean;
  failPost?: boolean;
};
async function mockPublic(page: Page, state: State) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/products" && state.failProducts)
      return route.abort("failed");
    if (url.pathname === "/api/products")
      return route.fulfill({ json: state.products });
    if (url.pathname === "/api/delivery-zones")
      return route.fulfill({ json: state.zones });
    if (url.pathname === "/api/delivery-windows")
      return route.fulfill({ json: state.windows });
    if (url.pathname === "/api/orders" && route.request().method() === "POST") {
      state.posts++;
      if (state.failPost) return route.abort("failed");
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

test("changed delivery fee refreshes the estimate and requires another submission", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  data.zones = [{ ...zone, delivery_fee_bani: 3500 }];
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("Condițiile de livrare s-au schimbat");
  await expect(page.locator(".checkout-summary")).toContainText("35,00 MDL");
  await expect(page.locator(".checkout-summary")).toContainText("685,00 MDL");
  expect(data.posts).toBe(0);
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toBeVisible();
  expect(data.posts).toBe(1);
});

test("changed minimum updates the summary and blocks an insufficient basket", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  data.zones = [{ ...zone, minimum_basket_bani: 80000 }];
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("Condițiile de livrare s-au schimbat");
  await expect(page.locator(".checkout-summary")).toContainText("800,00 MDL");
  await expect(page.getByRole("button", { name: "Trimite cererea" })).toBeDisabled();
  expect(data.posts).toBe(0);
});

test("simultaneous product and delivery changes are both disclosed", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  data.products = [{ ...product, price_bani: 70000 }, frozen];
  data.zones = [{ ...zone, delivery_fee_bani: 3500 }];
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("Prețul");
  await expect(page.getByRole("alert")).toContainText("Condițiile de livrare s-au schimbat");
  await expect(page.locator(".checkout-summary")).toContainText("735,00 MDL");
  expect(data.posts).toBe(0);
});

test("a storage change that makes the cart incompatible blocks checkout", async ({ page }) => {
  const data = state();
  const second = { ...product, id: 3, name: "Al doilea produs" };
  data.products = [product, second];
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  await page.getByRole("button", { name: "Adaugă Al doilea produs în coș" }).click();
  await page.getByRole("link", { name: /Coș:/ }).click();
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  data.products = [product, { ...second, storage_type: "frozen" }];
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("condițiile de păstrare");
  await expect(page.getByText("Produsele trebuie să aibă același tip de păstrare validat.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trimite cererea" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Coș: 2 produse" })).toBeVisible();
  expect(data.posts).toBe(0);
});

for (const scenario of ["storage", "inactive-zone", "expired-window", "inactive-window", "full-window", "network"] as const) {
  test(`checkout preserves the cart for ${scenario}`, async ({ page }) => {
    const data = state();
    await mockPublic(page, data);
    await checkout(page);
    if (scenario === "storage") data.products = [{ ...product, storage_type: "frozen" }, frozen];
    if (scenario === "inactive-zone") data.zones = [{ ...zone, active: false }];
    if (scenario === "expired-window") data.windows = [{ ...windowData, ordering_cutoff: "2000-01-01T00:00:00Z" }];
    if (scenario === "inactive-window") data.windows = [{ ...windowData, active: false }];
    if (scenario === "full-window") data.windows = [{ ...windowData, capacity: 1, reserved_orders: 1 }];
    if (scenario === "network") data.failProducts = true;
    await page.getByRole("button", { name: "Trimite cererea" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(data.posts).toBe(0);
    await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toBeVisible();
    if (scenario === "storage") {
      await page.getByRole("link", { name: /Coș:/ }).click();
      await expect(page.getByText("Congelat", { exact: false })).toBeVisible();
    }
  });
}

for (const status of [400, 409, 422, 0]) {
  test(`order failure ${status || "network"} retains the cart`, async ({ page }) => {
    const data = state();
    data.postStatus = status;
    data.failPost = status === 0;
    await mockPublic(page, data);
    await checkout(page);
    await page.getByRole("button", { name: "Trimite cererea" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toBeVisible();
    expect(data.posts).toBe(1);
  });
}

test("reloading a changed cart alerts without silently replacing its price", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  data.products = [{ ...product, price_bani: 70000 }, frozen];
  await page.goto("/cos");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Plan test");
  await expect(page.locator(".cart-summary")).toContainText("650,00 MDL");
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.getByRole("alert")).toContainText("Prețul");
  await expect(page.locator(".checkout-summary")).toContainText("700,00 MDL");
  expect(data.posts).toBe(0);
});

test("a changed cart price can be reviewed before meeting the minimum", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  data.products = [{ ...product, price_bani: 75000 }, frozen];
  data.zones = [{ ...zone, minimum_basket_bani: 70000 }];
  await page.goto("/cos");
  await expect(page.getByRole("alert")).toContainText("Plan test");
  await page.getByRole("button", { name: "Actualizează produsele disponibile" }).click();
  await expect(page.locator(".cart-summary")).toContainText("750,00 MDL");
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  await expect(page.getByRole("button", { name: "Trimite cererea" })).toBeEnabled();
  expect(data.posts).toBe(0);
});

test("live and demo carts stay isolated across mode changes and refresh", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByLabel("Cantitate pentru Plan test").fill("2");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  await page.getByRole("button", { name: "Încearcă demo" }).click();
  await expect(page.getByRole("link", { name: "Coș: 0 produse" })).toBeVisible();
  await page.getByRole("button", { name: "Adaugă Plan de mese pentru 3 zile în coș" }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toBeVisible();
  await page.getByRole("button", { name: "Ieși din demo" }).click();
  await page.getByRole("link", { name: "Coș: 2 produse" }).click();
  await expect(page.getByText("Plan test", { exact: true })).toBeVisible();
  expect(data.posts).toBe(0);
});

test("customer direct routes, reload and browser history work", async ({ page }) => {
  await mockPublic(page, state());
  for (const path of ["/", "/catalog", "/planuri", "/cos", "/checkout"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
  }
  await page.goto("/catalog");
  await page.getByRole("link", { name: /Coș:/ }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/cos$/);
});

for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }]) {
  test(`customer checkout controls fit and work on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockPublic(page, state());
    await checkout(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Trimite cererea" }).click();
    await expect(page.locator(".receipt")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

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
  const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  expect(stored).not.toContain("Client Test");
  expect(stored).not.toContain("+37360000000");
  expect(stored).not.toContain("Adresă fictivă");
});
