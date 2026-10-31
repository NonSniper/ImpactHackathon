export type StorageType = "fresh" | "chilled" | "frozen" | "pending_validation";
export type Product = {
  id: number;
  name: string;
  description: string;
  category: string;
  price_bani: number;
  storage_type: StorageType;
  available: boolean;
  demo_only: boolean;
  sku: string | null;
  product_type: "meal_plan" | "individual_dish";
  unit: string;
  net_weight_g: number | null;
  preparation_type: string | null;
  ingredients: string | null;
  allergens: string | null;
  shelf_life_days: number | null;
  preparation_instructions: string | null;
  supplier: string;
  image_preview_url: string | null;
  image_detail_url?: string | null;
  production_cost_bani?: number | null;
};
export type Zone = {
  id: number;
  city: string;
  name: string;
  neighborhood: string;
  active: boolean;
  parent_zone_id: number | null;
  minimum_basket_bani: number;
  delivery_fee_bani: number;
};
export type Window = {
  id: number;
  zone_id: number;
  delivery_at: string;
  ordering_cutoff: string;
  active?: boolean;
  capacity?: number | null;
  reserved_orders?: number;
  is_demo?: boolean;
};
export type Order = {
  id: number;
  customer_name: string;
  zone_id: number;
  delivery_window_id: number;
  delivery_at: string;
  delivery_batch_id: number | null;
  subtotal_bani: number;
  delivery_fee_bani: number;
  total_bani: number;
  status: string;
  created_at: string;
  is_demo: boolean;
};
export type OrderDetail = Order & {
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  location_verification_status: string;
  location_review_note: string | null;
  delivery_instructions: string | null;
  items: {
    product_id: number;
    product_name: string | null;
    quantity: number;
    unit_price_bani: number;
    line_total_bani: number;
    storage_type_snapshot: StorageType | null;
    unit_snapshot: string | null;
  }[];
};
export type OrderCreated = {
  id: number;
  subtotal_bani: number;
  delivery_fee_bani: number;
  total_bani: number;
  status: string;
};
export type Batch = {
  id: number;
  zone_id: number;
  delivery_window_id: number;
  storage_type: string;
  status: string;
  is_demo: boolean;
  created_at: string;
  order_ids?: number[];
};
export type BatchSummary = {
  batch_id: number;
  is_demo: boolean;
  household_count: number;
  total_item_quantity: number;
  total_sales_bani: number;
  total_weight_g: number | null;
  known_weight_g: number;
};
export type Financial = {
  estimate_complete: boolean;
  estimate_kind: string | null;
  revenue_bani: number;
  estimated_food_cost_bani: number | null;
  known_food_cost_bani: number;
  estimated_packaging_cost_bani: number | null;
  estimated_transport_bani: number | null;
  delivery_cost_per_household_bani: number | null;
  contribution_before_overhead_bani: number | null;
  orders_needed_to_cover_transport: number | null;
  unpriced_products: { product_id: number; reason: string }[];
};
export type Costs = {
  estimate_kind: "demo" | "operational" | null;
  estimated_transport_bani: number | null;
  estimated_packaging_per_order_bani: number | null;
};
export type Production = {
  products: {
    product_id: number;
    name: string;
    quantity: number;
    unit: string | null;
    total_weight_g: number | null;
    known_weight_g: number;
  }[];
};
export type MapOrder = {
  id: number;
  address: string;
  zone_id: number;
  delivery_window_id: number;
  latitude: number | null;
  longitude: number | null;
  location_verification_status: string;
  location_review_note: string | null;
  total_bani: number;
  status: string;
  delivery_batch_id: number | null;
  is_demo: boolean;
};
export type MapData = { markers: MapOrder[]; unlocated: MapOrder[] };
export type OrderInput = {
  customer_name: string;
  phone: string;
  address: string;
  zone_id: number;
  delivery_window_id: number;
  latitude: number | null;
  longitude: number | null;
  coordinate_source: "manual_map_pin" | null;
  delivery_instructions: string | null;
  items: { product_id: number; quantity: number }[];
};

const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") + "/api";
let unauthorized: (() => void) | undefined;
export function onUnauthorized(fn: () => void) {
  unauthorized = fn;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(base + path, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      "Nu se poate contacta serverul. Verifică conexiunea și încearcă din nou.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && token) unauthorized?.();
    let detail: unknown;
    try {
      detail = (await response.json()).detail;
    } catch {
      /* empty response */
    }
    const errors: Record<number, string> = {
      400: "Datele nu respectă condițiile comenzii.",
      401: "Token invalid sau expirat.",
      404: "Elementul nu mai există.",
      409: "Datele s-au schimbat între timp. Reîncarcă și încearcă din nou.",
      422: "Verifică datele introduse.",
      503: "Serviciul nu este configurat sau este momentan indisponibil.",
    };
    throw new ApiError(
      response.status,
      `${errors[response.status] || "Cererea nu a putut fi finalizată."}${typeof detail === "string" ? ` ${detail}` : ""}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const body = (value: unknown) => JSON.stringify(value);
export const api = {
  products: () => request<Product[]>("/products"),
  product: (id: number) => request<Product>(`/products/${id}`),
  zones: () => request<Zone[]>("/delivery-zones"),
  windows: (id: number) => request<Window[]>(`/delivery-windows?zone_id=${id}`),
  order: (value: OrderInput) =>
    request<OrderCreated>("/orders", { method: "POST", body: body(value) }),
  adminGet: <T>(path: string, token: string) =>
    request<T>(`/admin${path}`, {}, token),
  adminPost: <T>(path: string, value: unknown, token: string) =>
    request<T>(`/admin${path}`, { method: "POST", body: body(value) }, token),
  adminPatch: <T>(path: string, value: unknown, token: string) =>
    request<T>(`/admin${path}`, { method: "PATCH", body: body(value) }, token),
  adminDelete: <T>(path: string, token: string) =>
    request<T>(`/admin${path}`, { method: "DELETE" }, token),
  upload: (id: number, data: FormData, token: string) =>
    request<Product>(
      `/admin/products/${id}/images`,
      { method: "POST", body: data },
      token,
    ),
  download: async (path: string, token: string, filename: string) => {
    let res: Response;
    try {
      res = await fetch(base + "/admin" + path, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new ApiError(0, "Descărcarea nu a reușit.");
    }
    if (res.status === 401) {
      unauthorized?.();
      throw new ApiError(401, "Token invalid.");
    }
    if (!res.ok) throw new ApiError(res.status, "Descărcarea nu a reușit.");
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
export const money = (value: number | null | undefined) =>
  value == null
    ? "Indisponibil"
    : `${new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)} MDL`;
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ro-MD", {
    timeZone: "Europe/Chisinau",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const storageLabel: Record<StorageType, string> = {
  fresh: "Proaspăt",
  chilled: "Refrigerat",
  frozen: "Congelat",
  pending_validation: "În verificare",
};
