import type { Product, Zone, Window } from "./api";
const common = {
  available: true,
  demo_only: true,
  sku: null,
  unit: "pachet",
  preparation_type: null,
  ingredients: null,
  allergens: null,
  shelf_life_days: null,
  preparation_instructions: null,
  supplier: "Exemplu demonstrativ",
  image_preview_url: "/images/examples/rice-stew.jpg",
  image_detail_url: "/images/examples/rice-stew.jpg",
  fulfillment_group: "meals",
  preparation_level: "ready",
  plan_duration_days: null,
} as const;
export const demoProducts: Product[] = [
  {
    ...common,
    id: 9001,
    name: "Plan de mese pentru 3 zile",
    description: "Un exemplu de plan pentru mesele de acasă.",
    category: "meal_plan",
    product_type: "meal_plan",
    price_bani: 75000,
    plan_duration_days: 3,
    storage_type: "chilled",
    net_weight_g: null,
  },
  {
    ...common, id: 9005, name: "Plan clasic pentru 2 zile", description: "Mese ilustrative pentru două zile.", category: "planuri", product_type: "meal_plan", price_bani: 50000, storage_type: "chilled", net_weight_g: null, plan_duration_days: 2,
  },
  {
    ...common, id: 9006, name: "Plan vegetarian pentru 2 zile", description: "Un exemplu vegetarian pentru două zile.", category: "planuri", product_type: "meal_plan", price_bani: 56000, storage_type: "chilled", net_weight_g: null, plan_duration_days: 2,
  },
  {
    ...common, id: 9007, name: "Plan de familie pentru 3 zile", description: "Mese ilustrative pentru trei zile.", category: "planuri", product_type: "meal_plan", price_bani: 90000, storage_type: "chilled", net_weight_g: null, plan_duration_days: 3,
  },
  {
    ...common,
    id: 9002,
    name: "Sarmale de casă",
    description: "Exemplu ilustrativ de preparat pentru cutia ta.",
    category: "mâncare",
    product_type: "individual_dish",
    price_bani: 18000,
    storage_type: "chilled",
    net_weight_g: 500,
  },
  {
    ...common,
    id: 9003,
    name: "Supă de legume",
    description: "Exemplu ilustrativ de preparat pentru acasă.",
    image_preview_url: "/images/examples/vegetable-soup.jpg",
    image_detail_url: "/images/examples/vegetable-soup.jpg",
    category: "mâncare",
    product_type: "individual_dish",
    price_bani: 12000,
    storage_type: "chilled",
    net_weight_g: 500,
  },
  {
    ...common,
    id: 9004,
    name: "Colțunași",
    description: "Exemplu ilustrativ de produs congelat.",
    category: "congelate",
    product_type: "individual_dish",
    price_bani: 16000,
    storage_type: "frozen",
    fulfillment_group: "frozen",
    preparation_level: "semi_prepared",
    preparation_instructions: "Fierbe conform instrucțiunilor de pe ambalajul demonstrativ.",
    image_preview_url: null,
    image_detail_url: null,
    net_weight_g: 500,
  },
];
export const demoZones: Zone[] = [
  {
    id: 9001,
    city: "Chișinău",
    name: "Rîșcani — exemplu",
    neighborhood: "Rîșcani",
    active: true,
    parent_zone_id: null,
    minimum_basket_bani: 60000,
    delivery_fee_bani: 0,
  },
];
export function demoWindows(zone: number, group: "meals" | "frozen"): Window[] {
  return [
    {
      id: 9001,
      zone_id: zone,
      fulfillment_group: group,
      delivery_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      ordering_cutoff: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  ];
}
