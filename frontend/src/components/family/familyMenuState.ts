import type { Product } from "../../api";

export type MealPeriod = "breakfast" | "lunch" | "dinner";
export const periods: MealPeriod[] = ["breakfast", "lunch", "dinner"];
export const periodLabel: Record<MealPeriod, string> = {
  breakfast: "Mic dejun",
  lunch: "Prânz",
  dinner: "Cină",
};
export type Allocation = {
  product_id: number;
  day_index: number;
  member_label: string;
  quantity: number;
  meal_period?: MealPeriod | null;
};
export type CartItem = {
  product: Product;
  quantity: number;
  allocations?: Allocation[];
  menu_days?: number;
};
type Member = { id: string; label: string };
export type DraftAllocation = {
  product_id: number;
  member_id: string;
  day_index: number;
  meal_period: MealPeriod | null;
  quantity: number;
  product_name: string;
  price_bani: number;
};
export type Draft = {
  version: 1;
  members: Member[];
  days: number;
  allocations: DraftAllocation[];
  skipped: string[];
  stage: "members" | "days" | "meals" | "review";
  day: number;
  memberId: string;
  returnToReview: boolean;
};
const id = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
export const keyForMode = (mode: "live" | "demo") =>
  `credem-family-draft-${mode}`;
export function newDraft(): Draft {
  const member = { id: id(), label: "Adult 1" };
  return {
    version: 1,
    members: [member],
    days: 1,
    allocations: [],
    skipped: [],
    stage: "members",
    day: 1,
    memberId: member.id,
    returnToReview: false,
  };
}
export function readDraft(mode: "live" | "demo"): Draft {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(keyForMode(mode)) || "null",
    ) as Draft | null;
    if (
      value?.version === 1 &&
      Array.isArray(value.members) &&
      value.members.length &&
      Array.isArray(value.allocations) &&
      [1, 2, 3].includes(value.days) &&
      ["members", "days", "meals", "review"].includes(value.stage) &&
      value.members.some((m) => m.id === value.memberId)
    )
      return {
        ...value,
        skipped: Array.isArray(value.skipped) ? value.skipped : [],
      };
  } catch {
    /* A corrupt draft should not prevent ordering. */
  }
  return newDraft();
}
export function draftFromCart(cart: CartItem[]): Draft {
  const source = cart.flatMap((item) =>
    (item.allocations || []).map((a) => ({ ...a, product: item.product })),
  );
  const labels = [...new Set(source.map((a) => a.member_label))];
  const members = labels.map((label) => ({ id: id(), label }));
  if (!members.length) return newDraft();
  const allocations: DraftAllocation[] = [];
  for (const a of source) {
    const memberId = members.find((m) => m.label === a.member_label)!.id;
    const period = a.meal_period || null;
    const existing = allocations.find(
      (item) =>
        item.member_id === memberId &&
        item.day_index === a.day_index &&
        item.meal_period === period &&
        item.product_id === a.product_id,
    );
    if (existing) existing.quantity += a.quantity;
    else
      allocations.push({
        product_id: a.product_id,
        member_id: memberId,
        day_index: a.day_index,
        meal_period: period,
        quantity: a.quantity,
        product_name: a.product.name,
        price_bani: a.product.price_bani,
      });
  }
  return {
    version: 1,
    members,
    days: Math.max(
      1,
      ...cart.map((i) => i.menu_days || 0),
      ...source.map((a) => a.day_index),
    ),
    allocations,
    skipped: [],
    stage: "review",
    day: 1,
    memberId: members[0].id,
    returnToReview: false,
  };
}
export function totalsFor(
  allocations: DraftAllocation[],
): Record<number, number> {
  return allocations.reduce<Record<number, number>>((r, a) => {
    r[a.product_id] = (r[a.product_id] || 0) + a.quantity;
    return r;
  }, {});
}
export function toOrderAllocations(draft: Draft): Allocation[] {
  return draft.allocations.map((a) => ({
    product_id: a.product_id,
    day_index: a.day_index,
    member_label: draft.members.find((m) => m.id === a.member_id)!.label.trim(),
    quantity: a.quantity,
    meal_period: a.meal_period,
  }));
}
export function replaceMenu(
  cart: CartItem[],
  allocations: Allocation[],
  days: number,
  products: Product[],
): CartItem[] {
  const ordinary: CartItem[] = cart
    .map((item) => ({
      ...item,
      quantity:
        item.quantity -
        (item.allocations || []).reduce((n, a) => n + a.quantity, 0),
      allocations: undefined,
      menu_days: undefined,
    }))
    .filter((item) => item.quantity > 0);
  for (const productId of new Set(allocations.map((a) => a.product_id))) {
    const selected = allocations.filter((a) => a.product_id === productId);
    const quantity = selected.reduce((n, a) => n + a.quantity, 0);
    const idx = ordinary.findIndex((i) => i.product.id === productId);
    if (idx < 0)
      ordinary.push({
        product: products.find((p) => p.id === productId)!,
        quantity,
        allocations: selected,
        menu_days: days,
      });
    else
      ordinary[idx] = {
        ...ordinary[idx],
        product: products.find((p) => p.id === productId)!,
        quantity: ordinary[idx].quantity + quantity,
        allocations: selected,
        menu_days: days,
      };
  }
  return ordinary;
}
