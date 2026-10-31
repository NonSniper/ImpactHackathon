import { useEffect, useState } from "react";
import { money, type Product } from "../../api";
import {
  keyForMode,
  newDraft,
  periodLabel,
  periods,
  readDraft,
  toOrderAllocations,
  totalsFor,
  type Allocation,
  type CartItem,
  type Draft,
  type DraftAllocation,
  type MealPeriod,
} from "./familyMenuState";

type Props = {
  mode: "live" | "demo";
  products: Product[];
  cart: CartItem[];
  addMenu: (a: Allocation[], days: number) => Promise<boolean>;
  navigate: (path: string) => void;
};
const stages = ["Familia", "Zilele", "Mesele", "Verificare"] as const;
const stageNames: Draft["stage"][] = ["members", "days", "meals", "review"];
const slotKey = (member: string, day: number, period: MealPeriod) =>
  `${member}|${day}|${period}`;
const sum = (a: { quantity: number }[]) =>
  a.reduce((n, x) => n + x.quantity, 0);

export default function FamilyMenuBuilder({
  mode,
  products,
  cart,
  addMenu,
  navigate,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => readDraft(mode));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<MealPeriod | null>(null);
  const [pickerQuantity, setPickerQuantity] = useState<Record<number, number>>(
    {},
  );
  const [view, setView] = useState<"member" | "day">("member");
  useEffect(() => {
    sessionStorage.setItem(keyForMode(mode), JSON.stringify(draft));
  }, [mode, draft]);
  const update = (patch: Partial<Draft>) =>
    setDraft((old) => ({ ...old, ...patch }));
  const selectedMember =
    draft.members.find((m) => m.id === draft.memberId) || draft.members[0];
  const current = draft.allocations.filter(
    (a) => a.day_index === draft.day && a.member_id === selectedMember.id,
  );
  const totals = totalsFor(draft.allocations);
  const unavailable = draft.allocations.filter(
    (a) =>
      !products.some(
        (p) =>
          p.id === a.product_id &&
          p.available &&
          Boolean(p.demo_only) === (mode === "demo"),
      ),
  );
  const changed = draft.allocations.filter((a) => {
    const p = products.find((x) => x.id === a.product_id);
    return p && p.price_bani !== a.price_bani;
  });
  const cost = draft.allocations.reduce(
    (n, a) => n + a.price_bani * a.quantity,
    0,
  );
  const cartTotal = cart.reduce(
    (n, i) => n + i.product.price_bani * i.quantity,
    0,
  );
  const oldMenu = cart.reduce(
    (n, i) => n + i.product.price_bani * sum(i.allocations || []),
    0,
  );
  const combined = cartTotal - oldMenu + cost;
  const validMembers = () => {
    const labels = draft.members.map((m) => m.label.trim());
    if (labels.some((x) => !x) || new Set(labels).size !== labels.length) {
      setError("Introdu etichete distincte pentru toți membrii familiei.");
      return false;
    }
    setError("");
    return true;
  };
  const go = (stage: Draft["stage"]) => {
    setPicker(null);
    setError("");
    update({ stage });
  };
  const context = (
    day: number,
    memberId: string,
    returnToReview = draft.returnToReview,
  ) => {
    setPicker(null);
    update({ stage: "meals", day, memberId, returnToReview });
  };
  const stepContext = (delta: number) => {
    const index =
      (draft.day - 1) * draft.members.length +
      draft.members.findIndex((m) => m.id === selectedMember.id) +
      delta;
    if (index < 0) {
      go("days");
      return;
    }
    if (index >= draft.days * draft.members.length) {
      update({ stage: "review", returnToReview: false });
      return;
    }
    context(
      Math.floor(index / draft.members.length) + 1,
      draft.members[index % draft.members.length].id,
      false,
    );
  };
  const addDish = (product: Product, period: MealPeriod) => {
    const quantity = Math.max(
      1,
      Math.min(1000, Math.trunc(pickerQuantity[product.id] || 1)),
    );
    const aggregate = totals[product.id] || 0;
    const ordinary =
      (cart.find((i) => i.product.id === product.id)?.quantity || 0) -
      sum(cart.find((i) => i.product.id === product.id)?.allocations || []);
    if (aggregate + ordinary + quantity > 1000) {
      setError(
        "Cantitatea maximă este 1000 per produs, inclusiv produsele din coș.",
      );
      return;
    }
    setError("");
    setDraft((old) => {
      const existing = old.allocations.find(
        (a) =>
          a.member_id === selectedMember.id &&
          a.day_index === old.day &&
          a.meal_period === period &&
          a.product_id === product.id,
      );
      const allocations = existing
        ? old.allocations.map((a) =>
            a === existing ? { ...a, quantity: a.quantity + quantity } : a,
          )
        : [
            ...old.allocations,
            {
              product_id: product.id,
              member_id: selectedMember.id,
              day_index: old.day,
              meal_period: period,
              quantity,
              product_name: product.name,
              price_bani: product.price_bani,
            },
          ];
      return {
        ...old,
        allocations,
        skipped: old.skipped.filter(
          (k) => k !== slotKey(selectedMember.id, old.day, period),
        ),
      };
    });
  };
  const remove = (a: DraftAllocation) =>
    setDraft((old) => ({
      ...old,
      allocations: old.allocations.filter((x) => x !== a),
    }));
  const complete = async () => {
    if (saving) return;
    if (!validMembers()) return;
    if (!draft.allocations.length) {
      setError("Adaugă cel puțin un preparat în meniul familiei.");
      return;
    }
    if (draft.allocations.some((a) => !a.meal_period)) {
      setError(
        "Alege categoria pentru preparatele fără categorie înainte de salvare.",
      );
      return;
    }
    if (unavailable.length || changed.length) {
      setError(
        "Verifică produsele indisponibile sau prețurile schimbate înainte de a continua.",
      );
      return;
    }
    setSaving(true);
    try {
      if (await addMenu(toOrderAllocations(draft), draft.days))
        navigate("/cos");
      else
        setError(
          "Meniul nu poate fi adăugat. Verifică disponibilitatea, prețurile și cantitățile produselor.",
        );
    } catch {
      setError(
        "Nu am putut verifica produsele. Meniul a fost păstrat; încearcă din nou.",
      );
    } finally {
      setSaving(false);
    }
  };
  const showSelection = (a: DraftAllocation) => (
    <div
      className="family-selected"
      key={`${a.member_id}-${a.day_index}-${a.meal_period}-${a.product_id}`}
    >
      <span>
        <strong>{a.product_name}</strong> · {money(a.price_bani)}
        {unavailable.includes(a) && <em> · Indisponibil</em>}
        {changed.includes(a) && <em> · Preț schimbat</em>}
      </span>
      <label>
        Cantitate{" "}
        <input
          type="number"
          min="1"
          max="1000"
          value={a.quantity}
          onChange={(e) => {
            const q = Math.max(
              1,
              Math.min(1000, Math.trunc(Number(e.target.value)) || 1),
            );
            setDraft((old) => ({
              ...old,
              allocations: old.allocations.map((x) =>
                x === a ? { ...x, quantity: q } : x,
              ),
            }));
          }}
        />
      </label>
      <button type="button" className="text-button" onClick={() => remove(a)}>
        Elimină
      </button>
    </div>
  );
  return (
    <section className="container page family-builder">
      <div className="page-heading">
        <div>
          <p className="overline">MENIUL FAMILIEI · COȘ MESE</p>
          <h1>Creează meniul familiei tale</h1>
          <p>
            Un meniu pe gustul fiecăruia, într-o singură livrare refrigerată.
          </p>
        </div>
        <div className="family-header-actions">
          {cart.some((item) => item.allocations?.length) && (
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("/cos")}
            >
              Anulează editarea
            </button>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (
                window.confirm(
                  "Începi un meniu nou? Se va șterge ciorna curentă.",
                )
              ) {
                setDraft(newDraft());
                setError("");
                setPicker(null);
              }
            }}
          >
            Începe din nou
          </button>
        </div>
      </div>
      <nav className="family-steps" aria-label="Pașii meniului">
        {stages.map((s, i) => (
          <span
            key={s}
            aria-current={draft.stage === stageNames[i] ? "step" : undefined}
          >
            {i + 1}. {s}
          </span>
        ))}
      </nav>
      <div className="family-layout">
        <div className="family-main">
          {draft.stage === "members" && (
            <section className="family-panel">
              <p className="overline">PASUL 1 DIN 4</p>
              <h2>Cine va mânca?</h2>
              <p>
                Adaugă membrii familiei pentru care pregătim meniul. Nu sunt
                necesare nume reale.
              </p>
              <div className="family-members">
                {draft.members.map((m, i) => (
                  <div className="family-member" key={m.id}>
                    <span className="family-avatar" aria-hidden="true">
                      {i + 1}
                    </span>
                    <label>
                      Membru {i + 1}
                      <input
                        value={m.label}
                        maxLength={60}
                        onChange={(e) =>
                          setDraft((old) => ({
                            ...old,
                            members: old.members.map((x) =>
                              x.id === m.id
                                ? { ...x, label: e.target.value }
                                : x,
                            ),
                          }))
                        }
                      />
                    </label>
                    {draft.members.length > 1 && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          if (
                            draft.allocations.some(
                              (a) => a.member_id === m.id,
                            ) &&
                            !window.confirm(
                              "Elimini membrul și toate preparatele sale?",
                            )
                          )
                            return;
                          const members = draft.members.filter(
                            (x) => x.id !== m.id,
                          );
                          setDraft((old) => ({
                            ...old,
                            members,
                            memberId:
                              old.memberId === m.id
                                ? members[0].id
                                : old.memberId,
                            allocations: old.allocations.filter(
                              (a) => a.member_id !== m.id,
                            ),
                            skipped: old.skipped.filter(
                              (k) => !k.startsWith(`${m.id}|`),
                            ),
                          }));
                        }}
                      >
                        Elimină
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button-outline"
                onClick={() =>
                  setDraft((old) => ({
                    ...old,
                    members: [
                      ...old.members,
                      {
                        id:
                          globalThis.crypto?.randomUUID?.() ||
                          `${Date.now()}-${Math.random()}`,
                        label: `Membru ${old.members.length + 1}`,
                      },
                    ],
                  }))
                }
              >
                + Adaugă membru
              </button>
              <div className="family-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (validMembers()) go("days");
                  }}
                >
                  Continuă → Alege zilele
                </button>
              </div>
            </section>
          )}
          {draft.stage === "days" && (
            <section className="family-panel">
              <p className="overline">PASUL 2 DIN 4</p>
              <h2>Pentru câte zile pregătim meniul?</h2>
              <p>
                Zilele indică momentul consumului. Întregul meniu sosește
                într-un singur interval de livrare refrigerată.
              </p>
              <div className="family-day-options">
                {[1, 2, 3].map((day) => (
                  <button
                    type="button"
                    className="family-day-option"
                    aria-pressed={draft.days === day}
                    key={day}
                    onClick={() => {
                      if (
                        day < draft.days &&
                        draft.allocations.some((a) => a.day_index > day) &&
                        !window.confirm(
                          "Zilele eliminate conțin preparate. Ștergi aceste selecții?",
                        )
                      )
                        return;
                      setDraft((old) => ({
                        ...old,
                        days: day,
                        day: Math.min(old.day, day),
                        allocations: old.allocations.filter(
                          (a) => a.day_index <= day,
                        ),
                        skipped: old.skipped.filter(
                          (k) => Number(k.split("|")[1]) <= day,
                        ),
                      }));
                    }}
                  >
                    <strong>{day}</strong>
                    <span>{day === 1 ? "zi" : "zile"}</span>
                  </button>
                ))}
              </div>
              <div className="family-actions">
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => go("members")}
                >
                  Înapoi la familie
                </button>
                <button
                  type="button"
                  onClick={() => context(1, draft.members[0].id, false)}
                >
                  Continuă → Alege mesele
                </button>
              </div>
            </section>
          )}
          {draft.stage === "meals" && (
            <section className="family-panel">
              <p className="overline">
                ZIUA {draft.day} DIN {draft.days} ·{" "}
                {(draft.day - 1) * draft.members.length +
                  draft.members.findIndex((m) => m.id === selectedMember.id) +
                  1}{" "}
                DIN {draft.days * draft.members.length} PERSOANE-ZILE
              </p>
              <h2>Pregătim meniul pentru {selectedMember.label}</h2>
              <p>
                Alege micul dejun, prânzul și cina. Poți lăsa unele mese
                necompletate.
              </p>
              <div className="family-tabs" aria-label="Alege ziua">
                {Array.from({ length: draft.days }, (_, i) => i + 1).map(
                  (day) => (
                    <button
                      type="button"
                      key={day}
                      aria-pressed={draft.day === day}
                      onClick={() => context(day, selectedMember.id)}
                    >
                      Ziua {day}
                    </button>
                  ),
                )}
              </div>
              <div className="family-tabs" aria-label="Alege membrul">
                {draft.members.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    aria-pressed={m.id === selectedMember.id}
                    onClick={() => context(draft.day, m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {current.some((a) => !a.meal_period) && (
                <section className="family-slot">
                  <h3>Fără categorie</h3>
                  <p>
                    Alege explicit o categorie pentru fiecare preparat mai
                    vechi.
                  </p>
                  {current
                    .filter((a) => !a.meal_period)
                    .map((a) => (
                      <div key={a.product_id}>
                        {showSelection(a)}
                        <div className="family-tabs">
                          {periods.map((p) => (
                            <button
                              type="button"
                              key={p}
                              onClick={() =>
                                setDraft((old) => {
                                  const existing = old.allocations.find(
                                    (x) =>
                                      x !== a &&
                                      x.member_id === a.member_id &&
                                      x.day_index === a.day_index &&
                                      x.product_id === a.product_id &&
                                      x.meal_period === p,
                                  );
                                  return {
                                    ...old,
                                    skipped: old.skipped.filter(
                                      (k) =>
                                        k !==
                                        slotKey(a.member_id, a.day_index, p),
                                    ),
                                    allocations: existing
                                      ? old.allocations
                                          .filter((x) => x !== a)
                                          .map((x) =>
                                            x === existing
                                              ? {
                                                  ...x,
                                                  quantity:
                                                    x.quantity + a.quantity,
                                                }
                                              : x,
                                          )
                                      : old.allocations.map((x) =>
                                          x === a
                                            ? { ...x, meal_period: p }
                                            : x,
                                        ),
                                  };
                                })
                              }
                            >
                              {periodLabel[p]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </section>
              )}
              {periods.map((period) => {
                const items = current.filter((a) => a.meal_period === period);
                return (
                  <section className="family-slot" key={period}>
                    <div className="family-slot-heading">
                      <div>
                        <h3>{periodLabel[period]}</h3>
                        <p>
                          {items.length
                            ? `${sum(items)} porții`
                            : draft.skipped.includes(
                                  slotKey(selectedMember.id, draft.day, period),
                                )
                              ? "Omisă"
                              : "Nespecificat — poți sări peste această masă"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() =>
                          setPicker(picker === period ? null : period)
                        }
                      >
                        Adaugă preparat
                      </button>
                    </div>
                    {items.map(showSelection)}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (
                          items.length &&
                          !window.confirm(
                            `Elimini toate preparatele de la ${periodLabel[period]}?`,
                          )
                        )
                          return;
                        setDraft((old) => ({
                          ...old,
                          skipped: [
                            ...new Set([
                              ...old.skipped,
                              slotKey(selectedMember.id, old.day, period),
                            ]),
                          ],
                          allocations: old.allocations.filter(
                            (a) =>
                              !(
                                a.member_id === selectedMember.id &&
                                a.day_index === old.day &&
                                a.meal_period === period
                              ),
                          ),
                        }));
                      }}
                    >
                      Sari peste această masă
                    </button>
                    {picker === period && (
                      <div className="family-picker">
                        <h4>Alege preparate pentru {periodLabel[period]}</h4>
                        {!products.length && (
                          <p>
                            Nu sunt preparate compatibile disponibile în acest
                            moment.
                          </p>
                        )}
                        <div className="family-dishes">
                          {products
                            .filter(
                              (p) =>
                                p.available &&
                                Boolean(p.demo_only) === (mode === "demo"),
                            )
                            .map((p) => (
                              <article className="family-dish" key={p.id}>
                                <div className="family-dish-image">
                                  {p.image_preview_url ? (
                                    <img
                                      src={p.image_preview_url}
                                      alt={`Fotografie ilustrativă: ${p.name}`}
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <span aria-hidden="true">CREDEM</span>
                                  )}
                                </div>
                                <div>
                                  <h4>{p.name}</h4>
                                  <p>{p.description}</p>
                                  {p.allergens && (
                                    <p>Alergeni: {p.allergens}</p>
                                  )}
                                  <strong>{money(p.price_bani)}</strong>
                                  {p.image_preview_url?.includes(
                                    "vegetable-soup.jpg",
                                  ) && (
                                    <p>
                                      Foto:{" "}
                                      <a href="https://commons.wikimedia.org/wiki/File:Vegetable_soup_and_bread_at_the_office.jpg">
                                        JIP
                                      </a>
                                      ,{" "}
                                      <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                                        CC BY-SA 4.0
                                      </a>
                                    </p>
                                  )}
                                  <div className="family-dish-actions">
                                    <label>
                                      Cantitate {p.name}
                                      <input
                                        type="number"
                                        min="1"
                                        max="1000"
                                        value={pickerQuantity[p.id] || 1}
                                        onChange={(e) =>
                                          setPickerQuantity((old) => ({
                                            ...old,
                                            [p.id]: Math.max(
                                              1,
                                              Math.min(
                                                1000,
                                                Math.trunc(
                                                  Number(e.target.value),
                                                ) || 1,
                                              ),
                                            ),
                                          }))
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => addDish(p, period)}
                                    >
                                      Adaugă {p.name}
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setPicker(null)}
                        >
                          Închide lista
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
              <div className="family-actions">
                <button
                  type="button"
                  className="button-outline"
                  onClick={() =>
                    draft.returnToReview ? go("review") : stepContext(-1)
                  }
                >
                  Înapoi
                </button>
                <button
                  type="button"
                  onClick={() =>
                    draft.returnToReview
                      ? update({ stage: "review", returnToReview: false })
                      : stepContext(1)
                  }
                >
                  {draft.returnToReview ||
                  (draft.day === draft.days &&
                    selectedMember.id ===
                      draft.members[draft.members.length - 1].id)
                    ? "Verifică meniul familiei"
                    : "Salvează și continuă"}
                </button>
              </div>
            </section>
          )}
          {draft.stage === "review" && (
            <section className="family-panel">
              <p className="overline">PASUL 4 DIN 4</p>
              <h2>Meniul familiei tale</h2>
              <p>
                Verifică meniul și editează orice masă înainte de a-l adăuga în
                coș.
              </p>
              <div className="family-tabs">
                <button
                  type="button"
                  aria-pressed={view === "member"}
                  onClick={() => setView("member")}
                >
                  După membru
                </button>
                <button
                  type="button"
                  aria-pressed={view === "day"}
                  onClick={() => setView("day")}
                >
                  După zi
                </button>
              </div>
              <div className="family-tabs">
                {view === "member"
                  ? draft.members.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        aria-pressed={selectedMember.id === m.id}
                        onClick={() => update({ memberId: m.id })}
                      >
                        {m.label}
                      </button>
                    ))
                  : Array.from({ length: draft.days }, (_, i) => i + 1).map(
                      (day) => (
                        <button
                          type="button"
                          key={day}
                          aria-pressed={draft.day === day}
                          onClick={() => update({ day })}
                        >
                          Ziua {day}
                        </button>
                      ),
                    )}
              </div>
              {(view === "member"
                ? Array.from({ length: draft.days }, (_, i) => ({
                    day: i + 1,
                    member: selectedMember,
                  }))
                : draft.members.map((member) => ({ day: draft.day, member }))
              ).map(({ day, member }) => (
                <article className="family-agenda" key={`${day}-${member.id}`}>
                  <h3>{view === "member" ? `Ziua ${day}` : member.label}</h3>
                  {([...periods, null] as (MealPeriod | null)[]).map(
                    (period) => {
                      const items = draft.allocations.filter(
                        (a) =>
                          a.day_index === day &&
                          a.member_id === member.id &&
                          a.meal_period === period,
                      );
                      if (!period && !items.length) return null;
                      return (
                        <div
                          className="family-agenda-row"
                          key={period || "none"}
                        >
                          <p>
                            <strong>
                              {period ? periodLabel[period] : "Fără categorie"}:
                            </strong>{" "}
                            {items.length
                              ? items
                                  .map(
                                    (a) => `${a.product_name} ×${a.quantity}`,
                                  )
                                  .join(", ")
                              : period &&
                                  draft.skipped.includes(
                                    slotKey(member.id, day, period),
                                  )
                                ? "Omisă"
                                : "Nespecificat"}
                          </p>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => context(day, member.id, true)}
                          >
                            Editează
                          </button>
                        </div>
                      );
                    },
                  )}
                </article>
              ))}
              {(unavailable.length > 0 || changed.length > 0) && (
                <div role="alert" className="error">
                  <p>
                    {unavailable.length > 0 &&
                      "Unele preparate nu mai sunt disponibile. Editează selecțiile pentru a le înlocui. "}
                    {changed.length > 0 &&
                      "Prețul unor preparate s-a schimbat."}
                  </p>
                  {changed.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((old) => ({
                          ...old,
                          allocations: old.allocations.map((a) => {
                            const p = products.find(
                              (x) => x.id === a.product_id,
                            );
                            return p
                              ? {
                                  ...a,
                                  product_name: p.name,
                                  price_bani: p.price_bani,
                                }
                              : a;
                          }),
                        }))
                      }
                    >
                      Acceptă prețurile actualizate
                    </button>
                  )}
                </div>
              )}
              <div className="family-actions">
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => go("members")}
                >
                  Editează familia
                </button>
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => go("days")}
                >
                  Editează zilele
                </button>
                <button type="button" disabled={saving} onClick={complete}>
                  {saving ? "Se verifică produsele…" : "Adaugă meniul în coș"}
                </button>
              </div>
            </section>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <aside className="family-aside">
          <h2>Rezumatul tău</h2>
          <p>
            {draft.days} {draft.days === 1 ? "zi" : "zile"} ·{" "}
            {draft.members.length}{" "}
            {draft.members.length === 1 ? "membru" : "membri"} ·{" "}
            {sum(draft.allocations)}{" "}
            {sum(draft.allocations) === 1 ? "porție" : "porții"}
          </p>
          {Object.entries(totals).map(([id, q]) => (
            <p key={id}>
              {
                draft.allocations.find((a) => a.product_id === Number(id))
                  ?.product_name
              }{" "}
              × {q}
            </p>
          ))}
          <p>
            Meniu: <strong>{money(cost)}</strong>
          </p>
          <p>Coșul de mese existent: {money(cartTotal)}</p>
          {oldMenu > 0 && <p>Meniul vechi va fi înlocuit: −{money(oldMenu)}</p>}
          <p>
            Subtotal estimat: <strong>{money(combined)}</strong>
          </p>
          <p>
            Mai ai nevoie de {money(Math.max(0, 60000 - combined))} pentru
            minimul de 600 MDL. Zona poate avea un minim mai mare.
          </p>
        </aside>
      </div>
    </section>
  );
}
