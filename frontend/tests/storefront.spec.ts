import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.geoapify.com/**", route => route.abort("failed"));
});

const product = {
  id: 1,
  name: "Plan test",
  description: "Produs test",
  category: "plan",
  price_bani: 65000,
  storage_type: "chilled",
  available: true,
  demo_only: false,
  fulfillment_group: "meals",
  preparation_level: "ready",
  plan_duration_days: 2,
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
  fulfillment_group: "frozen",
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
  fulfillment_group: "meals",
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
  lastOrder?: any;
  successes?: number;
};
async function mockPublic(page: Page, state: State) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/products" && state.failProducts)
      return route.abort("failed");
    if (url.pathname === "/api/products")
      return route.fulfill({ json: state.products });
    if (url.pathname.startsWith("/api/products/")) {
      const found = state.products.find(p => (p as { id: number }).id === Number(url.pathname.split("/").pop()));
      return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { detail: "Not found" } });
    }
    if (url.pathname === "/api/delivery-zones")
      return route.fulfill({ json: state.zones });
    if (url.pathname === "/api/delivery-windows")
      return route.fulfill({ json: state.windows.map(w => ({ ...w, fulfillment_group: url.searchParams.get("fulfillment_group") || "meals" })) });
    if (url.pathname === "/api/orders" && route.request().method() === "POST") {
      state.posts++;
      state.lastOrder = route.request().postDataJSON();
      if (state.failPost) return route.abort("failed");
      if (state.postStatus === 201) state.successes = (state.successes || 0) + 1;
      return route.fulfill({
        status: state.postStatus,
        json:
          state.postStatus === 201
            ? {
                id: 41 + (state.successes || 1),
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

test("category filter and separate carts preserve quantities", async ({
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
  await page.goto("/congelate");
  await page
    .getByRole("button", { name: "Adaugă Produs congelat în coș" })
    .click();
  await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Coș: 1 produse" }),
  ).toBeVisible();
  await page.goto("/cos");
  await expect(page.getByRole("link", { name: "Coș: 2 produse" })).toBeVisible();
});

test("meals and frozen carts have independent minimums and persist", async ({ page }) => {
  const data = state();
  data.products = [{ ...product, price_bani: 55000 }, frozen];
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Plan test în coș" }).click();
  await page.goto("/congelate");
  await page.getByRole("button", { name: "Adaugă Produs congelat în coș" }).click();
  await page.goto("/cos/congelate");
  await expect(page.locator(".cart-summary")).toContainText("650,00 MDL");
  await page.reload();
  await page.goto("/cos");
  await expect(page.locator(".cart-summary")).toContainText("550,00 MDL");
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  await expect(page.getByRole("button", { name: "Trimite cererea" })).toBeDisabled();
  expect(data.posts).toBe(0);
});

test("frozen demo products show their photos and use the frozen cart", async ({ page }) => {
  await mockPublic(page, state());
  await page.goto("/");
  await page.getByRole("button", { name: "Încearcă demo" }).click();
  await page.goto("/congelate");
  for (const [name, image] of [
    ["Colțunași", "coltunasi-congelati-demo.webp"],
    ["Legume congelate", "legume-congelate-demo.webp"],
    ["Chiftele de pui congelate", "chiftele-congelate-demo.webp"],
    ["Ardei umpluți congelați", "ardei-congelati-demo.webp"],
    ["Clătite cu brânză congelate", "clatite-congelate-demo.webp"],
  ]) {
    const card = page.getByRole("button", { name: `Vezi ${name}`, exact: true });
    await expect(card.locator("img")).toHaveAttribute("src", `/images/examples/${image}`);
  }
  await page.getByRole("button", { name: "Adaugă Chiftele de pui congelate în coș" }).click();
  await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toHaveAttribute("href", "/cos/congelate");
});

test("each group retains its own confirmation after separate orders", async ({ page }) => {
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toContainText("#42");
  await page.goto("/congelate");
  await page.getByRole("button", { name: "Adaugă Produs congelat în coș" }).click();
  await page.goto("/cos/congelate");
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toContainText("#43");
  await page.reload();
  await expect(page.locator(".receipt")).toContainText("#43");
  await page.goto("/cerere-trimisa");
  await expect(page.locator(".receipt")).toContainText("#42");
});

test("a frozen product direct link selects the correct cart after refresh", async ({ page }) => {
  await mockPublic(page, state());
  await page.goto("/produs/2");
  await page.getByRole("heading", { name: "Produs congelat" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Adaugă în coș", exact: true }).click();
  await expect(page.getByRole("link", { name: "Coș: 1 produse" })).toHaveAttribute("href", "/cos/congelate");
});

async function startFamilyMeals(page: Page, days = 1) {
  await page.goto("/familie");
  await page.getByRole("button", { name: "Continuă → Alege zilele" }).click();
  await page.getByRole("button", { name: `${days} ${days === 1 ? "zi" : "zile"}` }).click();
  await page.getByRole("button", { name: "Continuă → Alege mesele" }).click();
}
function mealSlot(page: Page, name: string) {
  return page.locator(".family-slot").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("family picker requires an intentional choice and shows dish photos", async ({ page }) => {
  const data = state();
  data.products = [
    { ...product, id: 10, name: "Supă test", product_type: "individual_dish", plan_duration_days: null, image_preview_url: "/images/examples/vegetable-soup.jpg" },
    { ...product, id: 11, name: "Sarmale test", product_type: "individual_dish", plan_duration_days: null, image_preview_url: "/images/examples/sarmale-demo.webp" },
  ];
  await mockPublic(page, data);
  await startFamilyMeals(page);
  await expect(page.locator(".family-selected")).toHaveCount(0);
  await mealSlot(page, "Mic dejun").getByRole("button", { name: "Adaugă preparat" }).click();
  await expect(page.getByAltText("Fotografie ilustrativă: Supă test")).toBeVisible();
  await expect(page.getByAltText("Fotografie ilustrativă: Sarmale test")).toBeVisible();
  await mealSlot(page, "Mic dejun").getByRole("button", { name: "Adaugă Sarmale test" }).click();
  await expect(page.locator(".family-selected")).toHaveCount(1);
});

test("family allocations reach checkout as metadata on one aggregate item", async ({ page }) => {
  const data = state();
  data.products = [{ ...product, product_type: "individual_dish", name: "Preparat familie", price_bani: 30000, plan_duration_days: null }];
  await mockPublic(page, data);
  await startFamilyMeals(page, 2);
  await mealSlot(page, "Mic dejun").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Mic dejun").getByRole("button", { name: "Adaugă Preparat familie" }).click();
  await page.getByRole("button", { name: "Salvează și continuă" }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă Preparat familie" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.locator(".cart-summary")).toContainText("600,00 MDL");
  await page.getByRole("button", { name: /Continuă spre livrare/ }).click();
  await page.getByLabel("Nume și prenume").fill("Client Test");
  await page.getByLabel("Telefon").fill("+37360000000");
  await page.getByLabel("Adresa de livrare").fill("Adresă fictivă");
  await page.getByLabel("Zona de livrare").selectOption("1");
  await expect(page.getByLabel("Interval de livrare").locator("option")).toHaveCount(2);
  await page.getByLabel("Interval de livrare").selectOption("1");
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toBeVisible();
  expect(data.lastOrder.items).toEqual([{ product_id: 1, quantity: 2, custom_quantity: 2 }]);
  expect(data.lastOrder.allocations.map((a: any) => a.meal_period)).toEqual(["breakfast", "dinner"]);
  expect(data.lastOrder.menu_days).toBe(2);
});

test("draft supports members, skipped meals, multiple dishes and safe shortening", async ({ page }) => {
  const data = state();
  data.products = [ { ...product, id: 10, name: "Supă", product_type: "individual_dish", plan_duration_days: null }, { ...product, id: 11, name: "Orez", product_type: "individual_dish", plan_duration_days: null } ];
  await mockPublic(page, data);
  await page.goto("/familie");
  await page.getByRole("button", { name: "+ Adaugă membru" }).click();
  await page.getByLabel("Membru 2").fill("Copil 1");
  await page.getByRole("button", { name: "Continuă → Alege zilele" }).click();
  await page.getByRole("button", { name: "2 zile" }).click();
  await page.getByRole("button", { name: "Continuă → Alege mesele" }).click();
  await mealSlot(page, "Mic dejun").getByRole("button", { name: "Sari peste această masă" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Supă" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Orez" }).click();
  await page.reload();
  await expect(mealSlot(page, "Mic dejun")).toContainText("Omisă");
  await expect(mealSlot(page, "Prânz").locator(".family-selected")).toHaveCount(2);
  await page.getByRole("button", { name: "Ziua 2", exact: true }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă Orez" }).click();
  await page.getByRole("button", { name: "Înapoi" }).click();
  await page.getByRole("button", { name: "Înapoi" }).click();
  await page.getByRole("button", { name: "Înapoi" }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "1 zi" }).click();
  await expect(page.getByRole("button", { name: "2 zile" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Înapoi la familie" }).click();
  await page.getByLabel("Membru 1").fill("Adult nou");
  await page.getByRole("button", { name: "Continuă → Alege zilele" }).click();
  await page.getByRole("button", { name: "Continuă → Alege mesele" }).click();
  await expect(page.getByRole("heading", { name: "Pregătim meniul pentru Adult nou" })).toBeVisible();
  await expect(mealSlot(page, "Prânz").locator(".family-selected")).toHaveCount(2);
});

test("editing a menu replaces custom quantities and preserves ordinary items", async ({ page }) => {
  const data = state();
  data.products = [{ ...product, product_type: "individual_dish", name: "Preparat familie", price_bani: 30000, plan_duration_days: null }];
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Preparat familie în coș" }).click();
  await startFamilyMeals(page);
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Preparat familie" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.locator(".cart-summary")).toContainText("600,00 MDL");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Editează meniul familiei" }).click();
  await page.locator(".family-agenda-row").filter({ hasText: "Prânz" }).getByRole("button", { name: "Editează" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Preparat familie" }).click();
  await page.getByRole("button", { name: "Anulează editarea" }).click();
  await expect(page.locator(".cart-summary")).toContainText("600,00 MDL");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Editează meniul familiei" }).click();
  await page.locator(".family-agenda-row").filter({ hasText: "Prânz" }).getByRole("button", { name: "Editează" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Preparat familie" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.locator(".cart-summary")).toContainText("900,00 MDL");
  const cart = await page.evaluate(() => JSON.parse(sessionStorage.getItem("credem-cart-live-meals")!));
  expect(cart[0].quantity).toBe(3);
  expect(cart[0].allocations.reduce((n: number, a: any) => n + a.quantity, 0)).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem("credem-cart-live-frozen"))).toBeNull();
});

test("denied device location leaves manual map pin available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, fail: (error: object) => void) => fail({ code: 1 }) } });
  });
  const data = state();
  await mockPublic(page, data);
  await checkout(page);
  await page.getByText("Adaugă locația pe hartă (opțional)").click();
  await page.getByRole("button", { name: "Folosește locația mea" }).click();
  await expect(page.getByText("Nu am putut obține locația", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Alege pe hartă" }).click();
  await page.getByLabel("Alege locația de livrare pe hartă").click({ position: { x: 100, y: 100 } });
  await expect(page.getByLabel("Latitudine")).not.toHaveValue("");
  await expect(page.getByLabel("Longitudine")).not.toHaveValue("");
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toBeVisible();
  expect(data.lastOrder.coordinate_source).toBe("manual_map_pin");
});

test("failed address lookup leaves address and manual coordinates usable", async ({ page }) => {
  await mockPublic(page, state());
  await checkout(page);
  await page.getByText("Adaugă locația pe hartă (opțional)").click();
  await expect(page.getByText("Căutarea adresei nu este disponibilă", { exact: false })).toBeVisible();
  await page.getByLabel("Latitudine").fill("47.02");
  await page.getByLabel("Longitudine").fill("28.83");
  await page.getByRole("button", { name: "Trimite cererea" }).click();
  await expect(page.locator(".receipt")).toBeVisible();
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
      await expect(page.locator(".cart-description").getByText("Congelat", { exact: false })).toBeVisible();
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

test("family draft is isolated by mode and survives navigation", async ({ page }) => {
  const data = state();
  data.products = [{ ...product, product_type: "individual_dish", name: "Preparat live", plan_duration_days: null }];
  await mockPublic(page, data);
  await startFamilyMeals(page);
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Preparat live" }).click();
  await page.getByRole("button", { name: "Încearcă demo" }).click();
  await expect(page.getByRole("heading", { name: "Cine va mânca?" })).toBeVisible();
  await page.getByLabel("Membru 1").fill("Demo adult");
  await page.getByRole("button", { name: "Ieși din demo" }).click();
  await expect(page.getByRole("heading", { name: "Pregătim meniul pentru Adult 1" })).toBeVisible();
  await expect(mealSlot(page, "Prânz")).toContainText("Preparat live");
  await page.goto("/catalog");
  await page.goto("/familie");
  await expect(mealSlot(page, "Prânz")).toContainText("Preparat live");
  const stored = await page.evaluate(() => ({ live: sessionStorage.getItem("credem-family-draft-live"), demo: sessionStorage.getItem("credem-family-draft-demo") }));
  expect(stored.live).toContain("Preparat live");
  expect(stored.demo).toContain("Demo adult");
  expect(stored.demo).not.toContain("Preparat live");
});

test("family draft retains removed products and rechecks changed prices before cart", async ({ page }) => {
  const data = state();
  const dish = { ...product, product_type: "individual_dish", name: "Preparat live", plan_duration_days: null };
  data.products = [dish];
  await mockPublic(page, data);
  await startFamilyMeals(page);
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Prânz").getByRole("button", { name: "Adaugă Preparat live" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  data.products = [{ ...dish, price_bani: 70000 }];
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Prețul");
  await page.getByRole("button", { name: "Acceptă prețurile actualizate" }).click();
  data.products = [];
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.getByText("Unele preparate nu mai sunt disponibile", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("credem-family-draft-live"))).toContain("Preparat live");
  expect(await page.evaluate(() => sessionStorage.getItem("credem-cart-live-meals"))).toBeNull();
});

test("adding a menu never silently changes an ordinary cart item's stale price", async ({ page }) => {
  const data = state();
  const dish = { ...product, product_type: "individual_dish", name: "Preparat live", price_bani: 30000, plan_duration_days: null };
  data.products = [dish];
  await mockPublic(page, data);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Adaugă Preparat live în coș" }).click();
  data.products = [{ ...dish, price_bani: 35000 }];
  await startFamilyMeals(page);
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă Preparat live" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.getByText("Un produs obișnuit din coș", { exact: false })).toBeVisible();
  const cart = await page.evaluate(() => JSON.parse(sessionStorage.getItem("credem-cart-live-meals")!));
  expect(cart[0].product.price_bani).toBe(30000);
  expect(cart[0].quantity).toBe(1);
  await page.goto("/cos");
  await page.getByRole("button", { name: "Actualizează produsele disponibile" }).click();
  await page.goto("/familie");
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.locator(".cart-summary")).toContainText("700,00 MDL");
});

test("three-day review switches members and asks before removing selected members", async ({ page }) => {
  const data = state();
  data.products = [{ ...product, product_type: "individual_dish", name: "Supă", plan_duration_days: null }];
  await mockPublic(page, data);
  await page.goto("/familie");
  await page.getByRole("button", { name: "+ Adaugă membru" }).click();
  await page.getByLabel("Membru 2").fill("Copil 1");
  await page.getByRole("button", { name: "Continuă → Alege zilele" }).click();
  await page.getByRole("button", { name: "3 zile" }).click();
  await page.getByRole("button", { name: "Continuă → Alege mesele" }).click();
  await page.getByRole("button", { name: "Copil 1", exact: true }).click();
  await page.getByRole("button", { name: "Ziua 3", exact: true }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă preparat" }).click();
  await mealSlot(page, "Cină").getByRole("button", { name: "Adaugă Supă" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await expect(page.locator(".family-agenda").filter({ hasText: "Ziua 3" })).toContainText("Supă ×1");
  await page.getByRole("button", { name: "După zi" }).click();
  await expect(page.locator(".family-agenda").filter({ hasText: "Copil 1" })).toContainText("Supă ×1");
  await page.getByRole("button", { name: "Editează familia" }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".family-member").filter({ has: page.getByLabel("Membru 2") }).getByRole("button", { name: "Elimină" }).click();
  await expect(page.getByLabel("Membru 2")).toHaveValue("Copil 1");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".family-member").filter({ has: page.getByLabel("Membru 2") }).getByRole("button", { name: "Elimină" }).click();
  await expect(page.getByLabel("Membru 2")).toHaveCount(0);
});

test("legacy family allocations stay unclassified until the customer assigns a period", async ({ page }) => {
  const data = state();
  const dish = { ...product, product_type: "individual_dish", name: "Preparat vechi", price_bani: 60000, plan_duration_days: null };
  data.products = [dish];
  await mockPublic(page, data);
  await page.addInitScript(item => sessionStorage.setItem("credem-cart-live-meals", JSON.stringify([{ product: item, quantity: 2, menu_days: 1, allocations: [{ product_id: 1, day_index: 1, member_label: "Adult 1", quantity: 1 }, { product_id: 1, day_index: 1, member_label: "Adult 1", quantity: 1 }] }])), dish);
  await page.goto("/cos");
  await expect(page.getByText("Fără categorie", { exact: false })).toHaveCount(2);
  await page.getByRole("button", { name: "Editează meniul familiei" }).click();
  await expect(page.locator(".family-agenda")).toContainText("Fără categorie");
  await page.locator(".family-agenda-row").filter({ hasText: "Fără categorie" }).getByRole("button", { name: "Editează" }).click();
  await expect(mealSlot(page, "Fără categorie").locator(".family-selected")).toHaveCount(1);
  await mealSlot(page, "Fără categorie").getByRole("button", { name: "Mic dejun" }).click();
  await page.getByRole("button", { name: "Verifică meniul familiei" }).click();
  await page.getByRole("button", { name: "Adaugă meniul în coș" }).click();
  await expect(page.getByText("Mic dejun", { exact: false })).toBeVisible();
  const cart = await page.evaluate(() => JSON.parse(sessionStorage.getItem("credem-cart-live-meals")!));
  expect(cart[0].quantity).toBe(2);
  expect(cart[0].allocations[0].meal_period).toBe("breakfast");
  expect(cart[0].allocations[0].quantity).toBe(2);
});
