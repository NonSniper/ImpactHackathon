import { test, expect, type Page } from "@playwright/test";

const order = {
  id: 5,
  customer_name: "Client Test",
  zone_id: 1,
  delivery_window_id: 2,
  delivery_at: "2099-01-03T12:00:00Z",
  delivery_batch_id: null,
  subtotal_bani: 65000,
  delivery_fee_bani: 0,
  total_bani: 65000,
  status: "requested",
  created_at: "2099-01-01T12:00:00Z",
  is_demo: false,
};
const unlocated = {
  id: 5,
  address: "Adresă fictivă",
  zone_id: 1,
  delivery_window_id: 2,
  latitude: null,
  longitude: null,
  location_verification_status: "unlocated",
  location_review_note: null,
  total_bani: 65000,
  status: "requested",
  delivery_batch_id: null,
  is_demo: false,
};
async function login(page: Page) {
  await page.getByLabel("Token de acces").fill("test-token");
  await page.getByRole("button", { name: "Intră în administrare" }).click();
}

test("direct admin routes survive reload but token does not persist", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/orders")) return route.fulfill({ json: [order] });
    if (path.endsWith("/delivery-zones") || path.endsWith("/delivery-windows"))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/orders");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Comenzi", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Produse", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page.reload();
  await expect(page.getByLabel("Token de acces")).toBeVisible();
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Produse", exact: true }),
  ).toBeVisible();
});

test("401 clears the token and returns to access screen", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/**", async (route) => {
    if (
      new URL(route.request().url()).pathname.endsWith("/orders") &&
      ++calls === 1
    )
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 401, json: { detail: "Invalid token" } });
  });
  await page.goto("/admin");
  await login(page);
  await expect(page.getByLabel("Token de acces")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("invalid");
});

test("unlocated order can receive coordinates without automatic verification", async ({
  page,
}) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/location")) {
      saved = route.request().postDataJSON();
      return route.fulfill({
        json: {
          ...unlocated,
          latitude: 47.02,
          longitude: 28.83,
          location_verification_status: "unverified",
        },
      });
    }
    if (path.endsWith("/orders/map"))
      return route.fulfill({ json: { markers: [], unlocated: [unlocated] } });
    if (path.endsWith("/orders/5"))
      return route.fulfill({
        json: {
          ...order,
          phone: "+37360000000",
          address: "Adresă fictivă",
          latitude: null,
          longitude: null,
          location_verification_status: "unlocated",
          location_review_note: null,
          delivery_instructions: null,
          items: [],
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/map");
  await login(page);
  await page.getByRole("button", { name: "Comanda #5" }).click();
  await expect(page.getByText("Client Test", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marchează verificat manual" }),
  ).toBeDisabled();
  await page.getByLabel("Latitudine").fill("47.02");
  await page.getByLabel("Longitudine").fill("28.83");
  await page.getByRole("button", { name: "Salvează coordonatele" }).click();
  await expect(page.getByText("unverified", { exact: false })).toBeVisible();
  expect(saved).toMatchObject({ latitude: 47.02, longitude: 28.83 });
  expect(saved).not.toHaveProperty("location_verification_status");
});

test("incomplete financial estimate exposes known and missing costs", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/batches/1/financial-summary"))
      return route.fulfill({
        json: {
          estimate_complete: false,
          estimate_kind: null,
          revenue_bani: 65000,
          estimated_food_cost_bani: null,
          known_food_cost_bani: 12000,
          estimated_packaging_cost_bani: null,
          estimated_transport_bani: null,
          delivery_cost_per_household_bani: null,
          contribution_before_overhead_bani: null,
          orders_needed_to_cover_transport: null,
          unpriced_products: [{ product_id: 7, reason: "missing_cost" }],
        },
      });
    if (path.endsWith("/batches/1/production"))
      return route.fulfill({
        json: {
          products: [
            {
              product_id: 7,
              name: "Supă",
              quantity: 1,
              unit: "pack",
              total_weight_g: null,
              known_weight_g: 0,
            },
          ],
        },
      });
    if (path.endsWith("/batches/1/summary"))
      return route.fulfill({
        json: {
          batch_id: 1,
          is_demo: false,
          household_count: 1,
          total_item_quantity: 1,
          total_sales_bani: 65000,
          total_weight_g: null,
          known_weight_g: 0,
        },
      });
    if (path.endsWith("/batches/1/costs"))
      return route.fulfill({
        json: {
          estimate_kind: null,
          estimated_transport_bani: null,
          estimated_packaging_per_order_bani: null,
        },
      });
    if (path.endsWith("/packing-list"))
      return route.fulfill({ json: { orders: [] } });
    if (path.endsWith("/delivery-manifest"))
      return route.fulfill({ json: { stops: [] } });
    if (path.endsWith("/batches/1"))
      return route.fulfill({
        json: {
          id: 1,
          zone_id: 1,
          delivery_window_id: 2,
          storage_type: "chilled",
          status: "open",
          is_demo: false,
          order_ids: [5],
        },
      });
    if (path.endsWith("/batches"))
      return route.fulfill({
        json: [
          {
            id: 1,
            zone_id: 1,
            delivery_window_id: 2,
            storage_type: "chilled",
            status: "open",
            is_demo: false,
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/batches");
  await login(page);
  await page.getByRole("button", { name: /Lot #1/ }).click();
  await expect(
    page.getByText("Cost cunoscut parțial:", { exact: false }),
  ).toContainText("120,00 MDL");
  await expect(
    page.getByText("Supă: cost lipsă", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Cost produse: Indisponibil")).toBeVisible();
});
