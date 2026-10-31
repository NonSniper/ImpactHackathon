import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  dateTime,
  money,
  storageLabel,
  type OrderCreated,
  type OrderInput,
  type Product,
  type Window,
  type Zone,
  type FulfillmentGroup,
} from "./api";
import { demoProducts, demoWindows, demoZones } from "./demo";
import Admin from "./admin/Admin";
import LocationPicker from "./components/LocationPicker";

type Allocation = { product_id: number; day_index: number; member_label: string; quantity: number };
type CartItem = { product: Product; quantity: number; allocations?: Allocation[]; menu_days?: number };
type Mode = "live" | "demo";
type Confirmation = { order: OrderCreated; demo: boolean; group?: FulfillmentGroup; delivery_at?: string };
const readConfirmation = (mode: Mode, group: FulfillmentGroup): Confirmation | null => {
  try {
    const stored = sessionStorage.getItem(`credem-confirmation-${mode}-${group}`) || (group === "meals" ? sessionStorage.getItem("credem-confirmation") : null);
    const value = stored ? JSON.parse(stored) as Confirmation : null;
    return value && value.demo === (mode === "demo") ? value : null;
  } catch { return null; }
};
const readCart = (mode: Mode, group: FulfillmentGroup): CartItem[] => {
  try {
    const saved = sessionStorage.getItem(`credem-cart-${mode}-${group}`);
    const data = JSON.parse(saved || sessionStorage.getItem(`credem-cart-${mode}`) || "[]");
    return Array.isArray(data) ? (saved ? data : data.filter((item: CartItem) => (item.product.fulfillment_group || "meals") === group)) : [];
  } catch {
    return [];
  }
};
function FoodImage({ src, alt, fallback }: { src?: string | null; alt: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> : <>{fallback}</>;
}
function FeatureIcon({ name }: { name: "flex" | "price" | "delivery" }) {
  return <svg className="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "flex" ? <><path d="M4 7h13M14 4l3 3-3 3M20 17H7m3-3-3 3 3 3" /></> : name === "price" ? <><path d="M12 3v18M16 7.5c0-1.5-1.8-2.5-4-2.5S8 6 8 7.5 9.5 10 12 10s4 1 4 3-1.8 3-4 3-4-1-4-3" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}</svg>;
}
function Icon({ name }: { name: "bag" | "arrow" | "plus" | "minus" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "bag" ? (
        <>
          <path d="M4 8h16l-1 12H5L4 8Z" />
          <path d="M9 9V6a3 3 0 0 1 6 0v3" />
        </>
      ) : name === "arrow" ? (
        <>
          <path d="M4 12h15M14 7l5 5-5 5" />
        </>
      ) : name === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : (
        <path d="M5 12h14" />
      )}
    </svg>
  );
}
export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [group, setGroup] = useState<FulfillmentGroup>(() => location.pathname.includes("congelate") ? "frozen" : "meals");
  const navigate = useCallback((url: string) => {
    if (url.includes("congelate")) setGroup("frozen");
    else if (["/planuri", "/catalog", "/familie", "/cos", "/checkout", "/cerere-trimisa"].includes(url)) setGroup("meals");
    setMenuOpen(false);
    history.pushState({}, "", url);
    setPath(url);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const fn = () => {
      setPath(location.pathname);
      if (location.pathname.includes("congelate")) setGroup("frozen");
      else if (["/planuri", "/catalog", "/familie", "/cos", "/checkout", "/cerere-trimisa"].includes(location.pathname)) setGroup("meals");
    };
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  const [mode, setMode] = useState<Mode>(() =>
    sessionStorage.getItem("credem-mode") === "demo" ? "demo" : "live",
  );
  const [carts, setCarts] = useState<Record<Mode, Record<FulfillmentGroup, CartItem[]>>>(() => ({
    live: { meals: readCart("live", "meals"), frozen: readCart("live", "frozen") },
    demo: { meals: readCart("demo", "meals"), frozen: readCart("demo", "frozen") },
  }));
  const cart = carts[mode][group];
  const setCart = (fn: (current: CartItem[]) => CartItem[]) =>
    setCarts((current) => {
      const next = fn(current[mode][group]);
      sessionStorage.setItem(`credem-cart-${mode}-${group}`, JSON.stringify(next));
      return { ...current, [mode]: { ...current[mode], [group]: next } };
    });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Confirmation | null>(() => readConfirmation(mode, group));
  useEffect(() => {
    setResult(readConfirmation(mode, group));
  }, [mode, group]);
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    if (mode === "demo") {
      setProducts(demoProducts);
      setLoading(false);
      return;
    }
    api
      .products()
      .then((data) => {
        if (active) {
          setProducts(data);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  const add = (product: Product, quantity = 1) => {
    setNotice("");
    if (!product.available || Boolean(product.demo_only) !== (mode === "demo")) {
      setNotice("Produsul nu este disponibil în acest mod.");
      return;
    }
    if (product.fulfillment_group !== group) {
      setNotice("Acest produs aparține celuilalt coș. Comenzile se trimit separat.");
      return;
    }
    if (product.storage_type === "pending_validation") {
      setNotice(
        "Acest produs este în curs de verificare și nu poate fi comandat.",
      );
      return;
    }
    if (cart.length && cart[0].product.storage_type !== product.storage_type) {
      setNotice(
        "Produsele cu temperaturi diferite necesită comenzi separate. Golește coșul pentru a începe un alt coș.",
      );
      return;
    }
    setCart((items) => {
      const existing = items.find((i) => i.product.id === product.id);
      return existing
        ? items.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: Math.min(i.quantity + quantity, 1000) }
              : i,
          )
        : [...items, { product, quantity }];
    });
    setNotice(`${product.name} a fost adăugat în coș.`);
  };
  const change = (id: number, quantity: number) =>
    setCart((items) =>
      items
        .map((i) =>
          i.product.id === id
            ? { ...i, quantity: quantity === 0 ? 0 : Math.max(i.allocations?.reduce((n, a) => n + a.quantity, 0) || 1, Math.min(1000, quantity)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  const updateProducts = (fresh: Product[]) => {
    setProducts(fresh);
    setCart((items) =>
      items.map((item) => ({
        ...item,
        product: fresh.find((p) => p.id === item.product.id) || item.product,
      })),
    );
  };
  const changeAllocation = (productId: number, index: number, quantity: number) => setCart(items => items.map(item => {
    if (item.product.id !== productId || !item.allocations?.[index]) return item;
    const previous = item.allocations[index].quantity;
    const next = Math.max(0, Math.min(1000 - (item.quantity - previous), Math.trunc(quantity) || 0));
    const allocations = item.allocations.map((a, i) => i === index ? { ...a, quantity: next } : a).filter(a => a.quantity > 0);
    return { ...item, quantity: item.quantity - previous + next, allocations };
  }).filter(item => item.quantity > 0));
  const addMenu = (allocations: Allocation[], days: number) => {
    const ids = [...new Set(allocations.map(a => a.product_id))];
    const chosen = ids.map(id => products.find(p => p.id === id)).filter((p): p is Product => Boolean(p));
    if (group !== "meals" || chosen.length !== ids.length || chosen.some(p => !p.available || Boolean(p.demo_only) !== (mode === "demo") || p.fulfillment_group !== "meals" || p.storage_type !== "chilled" || p.preparation_level !== "ready") || (cart.length && cart[0].product.storage_type !== "chilled")) {
      setNotice("Meniul necesită produse refrigerate compatibile din coșul de mese.");
      return false;
    }
    if (chosen.some(p => (cart.find(i => i.product.id === p.id)?.quantity || 0) + allocations.filter(a => a.product_id === p.id).reduce((n, a) => n + a.quantity, 0) > 1000)) {
      setNotice("Cantitatea maximă este 1000 per produs.");
      return false;
    }
    setCart(items => {
      const next = [...items];
      for (const p of chosen) {
        const selected = allocations.filter(a => a.product_id === p.id);
        const quantity = selected.reduce((n, a) => n + a.quantity, 0);
        const idx = next.findIndex(i => i.product.id === p.id);
        if (idx < 0) next.push({ product: p, quantity, allocations: selected, menu_days: days });
        else next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity, allocations: [...(next[idx].allocations || []), ...selected], menu_days: Math.max(next[idx].menu_days || 0, days) };
      }
      return next;
    });
    setNotice("Meniul familiei a fost adăugat în coșul de mese.");
    return true;
  };
  const subtotal = cart.reduce(
    (sum, i) => sum + i.product.price_bani * i.quantity,
    0,
  );
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const frozenCount = carts[mode].frozen.reduce((sum, i) => sum + i.quantity, 0);
  const mealsCount = carts[mode].meals.reduce((sum, i) => sum + i.quantity, 0);
  const cartChanges =
    mode === "live" && !loading && !error
      ? cart.filter(({ product }) => {
          const current = products.find(
            (item) => item.id === product.id && item.available && !item.demo_only,
          );
          return (
            !current ||
            current.price_bani !== product.price_bani ||
            current.storage_type !== product.storage_type ||
            current.fulfillment_group !== product.fulfillment_group
          );
        })
      : [];
  if (path === "/admin" || path.startsWith("/admin/"))
    return <Admin path={path} navigate={navigate} />;
  const link = (event: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    event.preventDefault();
    navigate(url);
  };
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => link(e, "/")}>
          <span className="brand-symbol">C</span>
          <span>
            CREDEM <small>HOME</small>
          </span>
        </a>
        <button className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? "Închide" : "Meniu"}</button>
        <nav id="site-navigation" className={`nav${menuOpen ? " is-open" : ""}`} aria-label="Navigare principală">
          <a href="/planuri" aria-current={path === "/planuri" ? "page" : undefined} onClick={(e) => link(e, "/planuri")}>
            Planuri de mese
          </a>
          <a href="/catalog" aria-current={path === "/catalog" ? "page" : undefined} onClick={(e) => link(e, "/catalog")}>
            Construiește cutia
          </a>
          <a href="/familie" aria-current={path === "/familie" ? "page" : undefined} onClick={(e) => link(e, "/familie")}>Meniul familiei</a>
          <a href="/congelate" aria-current={path === "/congelate" ? "page" : undefined} onClick={(e) => link(e, "/congelate")}>Congelate</a>
        </nav>
        <div className="nav-actions">
          <button
            className="mode-switch"
            onClick={() => {
              const nextMode = mode === "live" ? "demo" : "live";
              sessionStorage.setItem("credem-mode", nextMode);
              setMode(nextMode);
              setNotice("");
            }}
          >
            {mode === "demo" ? "Ieși din demo" : "Încearcă demo"}
          </button>
          <a
            className="cart-link"
            href={group === "frozen" ? "/cos/congelate" : "/cos"}
            onClick={(e) => link(e, group === "frozen" ? "/cos/congelate" : "/cos")}
            aria-label={`Coș: ${count} produse`}
          >
            <Icon name="bag" />
            <span>Coș</span>
            <b>{count}</b>
          </a>
          <a href="/cos/congelate" onClick={(e) => link(e, "/cos/congelate")}>Congelate: {frozenCount} · {money(carts[mode].frozen.reduce((n, i) => n + i.product.price_bani * i.quantity, 0))}</a>
          <a href="/cos" onClick={(e) => link(e, "/cos")}>Mese: {mealsCount} · {money(carts[mode].meals.reduce((n, i) => n + i.product.price_bani * i.quantity, 0))}</a>
        </div>
      </header>
      {mode === "demo" && (
        <div className="demo-banner">
          Mod demonstrativ · Produsele, prețurile și comenzile sunt fictive și
          rămân doar în această sesiune. Fotografiile sunt ilustrative, nu produse CREDEM.
        </div>
      )}
      <main>
        {path === "/" ? (
          <>
            <section className="hero" aria-labelledby="home-title">
              <div className="hero-copy">
                <h1 id="home-title">Mâncare bună. <em>Mai mult timp pentru familie.</em></h1>
                <p>Alege preparatele potrivite pentru familia ta și lasă-ne nouă grija meselor.</p>
                <div className="actions">
                  <button onClick={() => navigate("/familie")}>Creează meniul familiei <Icon name="arrow" /></button>
                  <button className="button-light" onClick={() => navigate("/planuri")}>Descoperă planurile</button>
                </div>
                <p className="hero-delivery">Livrare programată, în intervalul ales de tine.</p>
              </div>
              <div className="hero-art">
                <img src="/images/examples/sarmale-demo.webp" alt="" />
                <div className="hero-note"><strong>Mai mult timp împreună.</strong><span>Mese alese pentru zilele tale.</span></div>
                <small className="hero-credit">Fotografie ilustrativă</small>
              </div>
            </section>
            <section className="container choice-section" aria-labelledby="categories-title">
              <div className="section-heading"><div><h2 id="categories-title">2 categorii de produse</h2><p>Două moduri de a aduce mai multă ușurință în fiecare zi.</p></div></div>
              <div className="category-showcase">
                <article className="category-panel meals-panel">
                  <div className="category-panel-heading"><div><span className="category-index">01 / MESE</span><h3>Gata pentru masă.</h3><p>Preparatele tale preferate, pregătite pentru zile mai liniștite.</p></div><figure className="category-photo"><img src="/images/examples/plan-familie-cutii-demo.webp" alt="" /><figcaption>Fotografie ilustrativă</figcaption></figure></div>
                  <div className="category-options">
                    <button className="category-option" onClick={() => navigate("/planuri")}><span><strong>Planuri pregătite de noi</strong><small>Pachete pentru 2 sau 3 zile, de la 250 MDL / zi.</small></span><Icon name="arrow" /></button>
                    <button className="category-option" onClick={() => navigate("/familie")}><span><strong>Meniul familiei</strong><small>Alege preparatele pentru fiecare zi și membru al familiei.</small></span><Icon name="arrow" /></button>
                  </div>
                </article>
                <article className="category-panel frozen-panel">
                  <span className="category-index">02 / CONGELATE</span>
                  <div className="frozen-art"><img src="/images/examples/coltunasi-congelati-demo.webp" alt="" /><span>Fotografie ilustrativă</span></div>
                  <h3>Îți vin în ajutor acasă.</h3>
                  <p>Produse congelate și semipreparate, gata de pregătit în ritmul tău.</p>
                  <p className="category-delivery">Coș și livrare separate · minim 600 MDL</p>
                  <button className="category-link" onClick={() => navigate("/congelate")}>Descoperă congelatele <Icon name="arrow" /></button>
                </article>
              </div>
              <div className="benefits" aria-label="Beneficii CREDEM Home">
                <div><FeatureIcon name="flex" /><h3>Flexibilitate</h3><p>Alegi mesele pentru familia ta.</p></div>
                <div><FeatureIcon name="price" /><h3>Prețuri transparente</h3><p>Vezi costurile înainte de a trimite cererea.</p></div>
                <div><FeatureIcon name="delivery" /><h3>Livrare programată</h3><p>Alegi dintre intervalele disponibile.</p></div>
              </div>
              <div className="how"><h2>Comanzi simplu. Livrăm programat.</h2><p>Alege produsele, selectează o zonă și un interval disponibil, apoi trimite cererea. Echipa CREDEM o va verifica și confirma. Mesele și congelatele necesită livrări separate; condițiile de păstrare se confirmă pentru fiecare produs.</p></div>
            </section>
          </>
        ) : null}
        {(path === "/catalog" || path === "/planuri" || path === "/congelate") && (
          <section className="container page">
            <div className="page-heading">
              <div>
                <p className="overline">CREDEM HOME</p>
                <h1>
                  {path === "/congelate" ? "Produse congelate și semipreparate" : path === "/planuri"
                    ? "Planuri de mese pentru 2 sau 3 zile"
                    : "Construiește-ți cutia"}
                </h1>
                <p>
                  {path === "/congelate" ? "Comandă separată, cu propriul minim și interval de livrare." : path === "/planuri"
                    ? "Mai puține griji pentru mesele de zi cu zi."
                    : "Alege preparatele potrivite pentru tine."}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  navigate(path === "/planuri" ? "/catalog" : "/planuri")
                }
              >
                {path === "/planuri"
                  ? "Vezi toate produsele"
                  : "Vezi planurile de mese"}{" "}
                →
              </button>
            </div>
            {loading ? (
              <p className="state">Se încarcă produsele…</p>
            ) : error ? (
              <div className="state error" role="alert">
                {error}{" "}
                <button
                  className="text-button"
                  onClick={() => window.location.reload()}
                >
                  Reîncearcă
                </button>
              </div>
            ) : (
              <Catalog
                key={`${mode}-${path}`}
                products={products.filter((p) => p.fulfillment_group === (path === "/congelate" ? "frozen" : "meals") && (
                  path === "/planuri" ? p.product_type === "meal_plan" : true),
                )}
                navigate={navigate}
                add={add}
                mode={mode}
              />
            )}
          </section>
        )}
        {path.startsWith("/produs/") && (
          <ProductDetail
            id={Number(path.split("/")[2])}
            mode={mode}
            navigate={navigate}
            add={add}
            selectGroup={setGroup}
          />
        )}
        {path === "/familie" && (loading ? <p className="state">Se încarcă produsele…</p> : error ? <p role="alert" className="error">{error}</p> : <FamilyBuilder products={products.filter(p => p.fulfillment_group === "meals" && p.product_type === "individual_dish" && p.storage_type === "chilled" && p.preparation_level === "ready")} addMenu={addMenu} navigate={navigate} cartSubtotal={subtotal} />)}
        {(path === "/cos" || path === "/cos/congelate") && (
          <section className="container page narrow">
            <div className="page-heading">
              <div>
                <p className="overline">COȘUL TĂU</p>
                <h1>Coș {group === "meals" ? "mese" : "congelate"}</h1>
                <p>Fiecare coș se comandă și se livrează separat, cu minim 600 MDL.</p>
              </div>
            </div>
            {cartChanges.length > 0 && (
              <div className="error" role="alert">
                <p>
                  Disponibilitatea, prețul sau condițiile de păstrare s-au
                  schimbat pentru: {cartChanges.map(({ product }) => product.name).join(", ")}.
                  Actualizează produsele disponibile și elimină-le pe cele indisponibile.
                </p>
                <button type="button" onClick={() => updateProducts(products)}>
                  Actualizează produsele disponibile
                </button>
              </div>
            )}
            <Cart
              cart={cart}
              change={change}
              clear={() => setCart(() => [])}
              subtotal={subtotal}
              navigate={navigate}
              group={group}
              changeAllocation={changeAllocation}
            />
          </section>
        )}
        {(path === "/checkout" || path === "/checkout/congelate") && (
          <Checkout
            mode={mode}
            group={group}
            cart={cart}
            subtotal={subtotal}
            navigate={navigate}
            updateProducts={updateProducts}
            onSuccess={(order, delivery_at) => {
              const confirmation = { order, demo: mode === "demo", group, delivery_at };
              sessionStorage.setItem(
                `credem-confirmation-${mode}-${group}`,
                JSON.stringify(confirmation),
              );
              setResult(confirmation);
              setCart(() => []);
              navigate(group === "frozen" ? "/cerere-trimisa/congelate" : "/cerere-trimisa");
            }}
          />
        )}
        {(path === "/cerere-trimisa" || path === "/cerere-trimisa/congelate") && (
          <section className="container page narrow">
            <div className="confirmation">
              <div className="checkmark">✓</div>
              <h1>
                {!result ? "Nicio cerere în această sesiune" : result.demo
                  ? "Cerere simulată trimisă"
                  : "Cererea a fost trimisă."}
              </h1>
              {result ? (
                <>
                  <p>
                    {result.demo
                      ? "Aceasta este o demonstrație în browser și nu a fost trimisă către CREDEM. Nu a fost confirmată nicio comandă și nu s-a efectuat nicio plată."
                      : "Îți mulțumim! Echipa CREDEM va verifica cererea. Comanda nu este încă confirmată și nu a fost efectuată nicio plată."}
                  </p>
                  <div className="receipt">
                    <div><span>Comandă</span><strong>{result.group === "frozen" ? "Congelate" : "Mese"}</strong></div>
                    {result.delivery_at && <div><span>Livrare</span><strong>{dateTime(result.delivery_at)}</strong></div>}
                    <div>
                      <span>Număr cerere</span>
                      <strong>
                        {result.demo ? "DEMO" : `#${result.order.id}`}
                      </strong>
                    </div>
                    <div>
                      <span>Produse</span>
                      <strong>{money(result.order.subtotal_bani)}</strong>
                    </div>
                    <div>
                      <span>Livrare</span>
                      <strong>{money(result.order.delivery_fee_bani)}</strong>
                    </div>
                    <div>
                      <span>Total solicitat</span>
                      <strong>{money(result.order.total_bani)}</strong>
                    </div>
                    <div>
                      <span>Stare</span>
                      <strong>Solicitată</strong>
                    </div>
                  </div>
                </>
              ) : (
                <p>
                  Detaliile cererii nu mai sunt disponibile în această pagină.
                </p>
              )}
              <button onClick={() => navigate("/")}>Înapoi la început</button>
            </div>
          </section>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Închide mesajul" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-brand">
              CREDEM <small>HOME</small>
            </div>
            <p>Mâncare pentru acasă, în ritmul tău.</p>
          </div>
          <div>
            <a href="/catalog" aria-current={path === "/catalog" ? "page" : undefined} onClick={(e) => link(e, "/catalog")}>
              Produse
            </a>
            <a href="/admin" onClick={(e) => link(e, "/admin")}>
              Administrare
            </a>
          </div>
          <span>Livrare programată · Chișinău</span>
        </div>
      </footer>
    </>
  );
}
function Catalog({
  products,
  navigate,
  add,
  mode,
}: {
  products: Product[];
  navigate: (s: string) => void;
  add: (p: Product, quantity?: number) => void;
  mode: Mode;
}) {
  const [category, setCategory] = useState("");
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "ro"));
  const visible = products.filter((p) => !category || p.category === category);
  return (
    <>
      {categories.length > 0 && (
        <div className="catalog-filters">
        <div className="category-tabs" role="group" aria-label="Categorii produse">
          <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>Toate</button>
          {categories.map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
        </div>
        <label className="catalog-filter visually-hidden">
          Categorie
          <select
            tabIndex={-1}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Toate categoriile</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        </div>
      )}
      {visible.length ? (
        <div className="product-grid">
          {visible.map((p) => (
            <CatalogCard
              key={p.id}
              product={p}
              navigate={navigate}
              add={add}
              mode={mode}
            />
          ))}
        </div>
      ) : (
        <div className="state empty">
          <h2>Nu sunt produse disponibile momentan.</h2>
          <p>
            {products.length
              ? "Nu există produse în această categorie."
              : mode === "live"
                ? "Produsele vor apărea aici după aprobarea lor. Poți explora experiența în modul demonstrativ."
                : "Nu există produse în această categorie."}
          </p>
        </div>
      )}
    </>
  );
}
function CatalogCard({
  product: p,
  navigate,
  add,
  mode,
}: {
  product: Product;
  navigate: (s: string) => void;
  add: (p: Product, quantity?: number) => void;
  mode: Mode;
}) {
  const [quantity, setQuantity] = useState(1);
  return (
    <article className="product-card">
      <button
        className="product-image"
        onClick={() => navigate(`/produs/${p.id}`)}
        aria-label={`Vezi ${p.name}`}
      >
        <FoodImage src={p.image_preview_url} alt="" fallback={<span className="image-placeholder"><span>CREDEM</span><small>{mode === "demo" ? "PRODUS ILUSTRATIV" : "FĂRĂ FOTOGRAFIE"}</small></span>} />
      </button>
      <div className="product-info">
        {p.image_preview_url?.includes("vegetable-soup.jpg") && <small>Foto ilustrativă: <a href="https://commons.wikimedia.org/wiki/File:Vegetable_soup_and_bread_at_the_office.jpg">JIP</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></small>}
        <div className="product-meta">
          <span>{storageLabel[p.storage_type] || p.storage_type}</span>
          <span>{p.net_weight_g ? `${p.net_weight_g} g` : p.unit}</span>
        </div>
        <button
          className="product-title"
          onClick={() => navigate(`/produs/${p.id}`)}
        >
          {p.name}
        </button>
        <p>{p.description}</p>
        {p.plan_duration_days && <p>{p.plan_duration_days} zile · {p.price_bani % p.plan_duration_days ? "aprox. " : ""}{money(Math.round(p.price_bani / p.plan_duration_days))} / zi</p>}
        {p.fulfillment_group === "frozen" && <p>Păstrare congelată · {p.preparation_instructions || "Verifică instrucțiunile de preparare."}</p>}
        <div className="product-bottom">
          <strong>{money(p.price_bani)}</strong>
          <div className="catalog-quantity-wrap"><button type="button" className="quantity-adjust" aria-label={`Scade cantitatea pentru ${p.name}`} onClick={() => setQuantity(q => Math.max(1, q - 1))}><Icon name="minus" /></button><label className="catalog-quantity">
            Cantitate
            <input
              aria-label={`Cantitate pentru ${p.name}`}
              type="number"
              min="1"
              max="1000"
              step="1"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.max(1, Math.min(1000, Math.trunc(Number(e.target.value)) || 1)),
                )
              }
            />
          </label><button type="button" className="quantity-adjust" aria-label={`Mărește cantitatea pentru ${p.name}`} onClick={() => setQuantity(q => Math.min(1000, q + 1))}><Icon name="plus" /></button></div>
          <button
            className="add-button"
            onClick={() => add(p, quantity)}
            disabled={p.storage_type === "pending_validation"}
            aria-label={`Adaugă ${p.name} în coș`}
          >
            <Icon name="plus" /><span>Adaugă</span>
          </button>
        </div>
      </div>
    </article>
  );
}
function ProductDetail({
  id,
  mode,
  navigate,
  add,
  selectGroup,
}: {
  id: number;
  mode: Mode;
  navigate: (s: string) => void;
  add: (p: Product, quantity?: number) => void;
  selectGroup: (group: FulfillmentGroup) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [p, setP] = useState<Product | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (p?.fulfillment_group) selectGroup(p.fulfillment_group); }, [p, selectGroup]);
  useEffect(() => {
    let active = true;
    setP(null);
    setError("");
    if (mode === "demo") {
      setP(demoProducts.find((item) => item.id === id) || null);
      return;
    }
    api
      .product(id)
      .then((v) => {
        if (active) setP(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, mode]);
  return (
    <section className="container page">
      <button className="text-button back" onClick={() => navigate(p?.fulfillment_group === "frozen" ? "/congelate" : "/catalog")}>
        ← Înapoi la produse
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !p ? (
        <p className="state">
          {mode === "demo"
            ? "Produsul nu a fost găsit."
            : "Se încarcă produsul…"}
        </p>
      ) : (
        <div className="detail-grid">
          <div className="detail-image">
            <FoodImage src={p.image_detail_url} alt={p.name} fallback={(
              <span className="image-placeholder">
                <span>CREDEM</span>
                <small>
                  {mode === "demo" ? "PRODUS ILUSTRATIV" : "FĂRĂ FOTOGRAFIE"}
                </small>
              </span>
            )} />
          </div>
          <div>
            {p.image_detail_url?.includes("vegetable-soup.jpg") && <small>Foto ilustrativă: <a href="https://commons.wikimedia.org/wiki/File:Vegetable_soup_and_bread_at_the_office.jpg">JIP</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></small>}
            <p className="overline">
              {storageLabel[p.storage_type]} ·{" "}
              {p.net_weight_g ? `${p.net_weight_g} g` : p.unit}
            </p>
            <h1>{p.name}</h1>
            <p className="lead">{p.description}</p>
            <p className="detail-price">{money(p.price_bani)}</p>
            {p.plan_duration_days && <p>{p.plan_duration_days} zile · {p.price_bani % p.plan_duration_days ? "aprox. " : ""}{money(Math.round(p.price_bani / p.plan_duration_days))} pe zi</p>}
            {p.ingredients && (
              <p>
                <strong>Ingrediente:</strong> {p.ingredients}
              </p>
            )}
            {p.allergens && (
              <p>
                <strong>Alergeni:</strong> {p.allergens}
              </p>
            )}
            {p.preparation_instructions && (
              <p>
                <strong>Preparare:</strong> {p.preparation_instructions}
              </p>
            )}
            {p.shelf_life_days != null && (
              <p>
                <strong>Termen de păstrare:</strong> {p.shelf_life_days} zile
              </p>
            )}
            <label className="detail-quantity">
              Cantitate
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(1000, Math.trunc(Number(e.target.value)) || 1)),
                  )
                }
              />
            </label>
            <button
              onClick={() => add(p, quantity)}
              disabled={p.storage_type === "pending_validation"}
            >
              Adaugă în coș <Icon name="plus" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
function FamilyBuilder({ products, addMenu, navigate, cartSubtotal }: { products: Product[]; addMenu: (a: Allocation[], days: number) => boolean; navigate: (s: string) => void; cartSubtotal: number }) {
  const [days, setDays] = useState(3);
  const [members, setMembers] = useState(["Adult 1"]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const totals = allocations.reduce<Record<number, number>>((result, a) => ({ ...result, [a.product_id]: (result[a.product_id] || 0) + a.quantity }), {});
  const cost = Object.entries(totals).reduce((sum, [id, q]) => sum + (products.find(p => p.id === Number(id))?.price_bani || 0) * q, 0);
  function add(day: number, member: string) {
    const id = Number(selected[`${day}-${member}`] || products[0]?.id);
    if (!id) return;
    setAllocations(old => {
      const existing = old.find(a => a.product_id === id && a.day_index === day && a.member_label === member);
      return existing ? old.map(a => a === existing ? { ...a, quantity: Math.min(1000, a.quantity + 1) } : a) : [...old, { product_id: id, day_index: day, member_label: member, quantity: 1 }];
    });
  }
  return <section className="container page">
    <div className="page-heading"><div><p className="overline">MENIUL FAMILIEI · COȘ MESE</p><h1>Creează meniul familiei tale</h1><p>Alege preparate pentru fiecare persoană și zi. Toate mesele sosesc într-o singură livrare refrigerată.</p></div></div>
    <div className="family-steps" aria-label="Pașii meniului"><span>1. Perioada</span><span>2. Familia</span><span>3. Preparatele</span><span>4. Rezumat</span></div>
    <section className="family-setup"><h2>1. Alege perioada</h2><p>Alege pentru câte zile pregătim meniul.</p><label>Număr de zile <select value={days} onChange={e => { const n = Number(e.target.value); setDays(n); setAllocations(old => old.filter(a => a.day_index <= n)); }}><option value={1}>1 zi</option><option value={2}>2 zile</option><option value={3}>3 zile</option></select></label></section>
    <div className="form-stack family-setup"><h2>2. Adaugă membrii familiei</h2><p>Fiecare persoană își poate avea propriile preparate.</p>{members.map((member, i) => <div key={i}><label>Membru {i + 1}<input value={member} maxLength={60} onChange={e => { const next = e.target.value; setMembers(old => old.map((m, j) => j === i ? next : m)); setAllocations(old => old.map(a => a.member_label === member ? { ...a, member_label: next } : a)); }} /></label>{members.length > 1 && <button type="button" className="text-button" onClick={() => { setMembers(old => old.filter((_, j) => j !== i)); setAllocations(old => old.filter(a => a.member_label !== member)); }}>Elimină membrul și selecțiile</button>}</div>)}<button type="button" className="button-outline" onClick={() => setMembers(old => [...old, `Membru ${old.length + 1}`])}>Adaugă membru</button></div>
    <div className="family-section-heading"><h2>3. Alege preparatele</h2><p>Adaugă porții pentru fiecare persoană și zi.</p></div>
    {!products.length && <p>Nu sunt preparate compatibile disponibile în acest moment.</p>}
    {Array.from({ length: days }, (_, index) => index + 1).map(day => <section className="admin-section family-day" key={day}><h2>Ziua {day}</h2><p>Subtotal zi: {money(allocations.filter(a => a.day_index === day).reduce((sum, a) => sum + (products.find(p => p.id === a.product_id)?.price_bani || 0) * a.quantity, 0))}</p>{members.map((member, index) => <div className="detail-panel" key={index}><h3>{member || `Membru ${index + 1}`}</h3>{allocations.filter(a => a.day_index === day && a.member_label === member).map((a, i) => <p key={`${a.product_id}-${i}`}>{products.find(p => p.id === a.product_id)?.name || `Produs #${a.product_id}`} <label>Cantitate <input type="number" min="1" max="1000" step="1" value={a.quantity} onChange={e => setAllocations(old => old.map(item => item === a ? { ...item, quantity: Math.max(1, Math.min(1000, Math.trunc(Number(e.target.value)) || 1)) } : item))} /></label> <button className="text-button" type="button" onClick={() => setAllocations(old => old.filter(item => item !== a))}>Elimină</button></p>)}<FamilyMealPreview product={products.find(p => p.id === Number(selected[`${day}-${member}`])) || products[0]} /><label>Preparat<select value={selected[`${day}-${member}`] || ""} onChange={e => setSelected({ ...selected, [`${day}-${member}`]: e.target.value })}><option value="">Alege preparatul</option>{products.map(p => <option value={p.id} key={p.id}>{p.name} · {money(p.price_bani)}</option>)}</select></label><button type="button" disabled={!products.length} onClick={() => add(day, member)}>Adaugă o porție</button></div>)}</section>)}
    <section className="cart-summary family-summary"><h2>4. Verifică meniul</h2><p>{days} zile · {members.length} membri · {allocations.reduce((n, a) => n + a.quantity, 0)} porții</p>{Object.entries(totals).map(([id, q]) => <p key={id}>{products.find(p => p.id === Number(id))?.name}: {q}</p>)}<p>Meniu: {money(cost)} · Subtotal coș estimat: {money(cartSubtotal + cost)}</p><strong>{money(cartSubtotal + cost)}</strong><p>Mai ai nevoie de {money(Math.max(0, 60000 - cartSubtotal - cost))} pentru minimul de 600 MDL al coșului de mese. Congelatele se comandă separat.</p>{error && <p role="alert" className="error">{error}</p>}<button type="button" onClick={() => { if (!allocations.length || members.some(m => !m.trim()) || new Set(members.map(m => m.trim())).size !== members.length) { setError("Adaugă preparate și etichete distincte pentru membrii familiei."); return; } if (addMenu(allocations, days)) navigate("/cos"); }}>Adaugă meniul în coș</button></section>
  </section>;
}
function FamilyMealPreview({ product }: { product?: Product }) {
  if (!product) return null;
  return <figure className="family-meal-preview">
    <FoodImage src={product.image_preview_url} alt={`Fotografie ilustrativă: ${product.name}`} fallback={<div className="family-meal-placeholder" aria-hidden="true">CREDEM</div>} />
    <figcaption><strong>{product.name}</strong><span>{money(product.price_bani)} · fotografie ilustrativă</span>{product.image_preview_url?.includes("vegetable-soup.jpg") && <small>Foto: <a href="https://commons.wikimedia.org/wiki/File:Vegetable_soup_and_bread_at_the_office.jpg">JIP</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></small>}</figcaption>
  </figure>;
}
function Cart({
  cart,
  change,
  clear,
  subtotal,
  navigate,
  group,
  changeAllocation,
}: {
  cart: CartItem[];
  change: (id: number, q: number) => void;
  clear: () => void;
  subtotal: number;
  navigate: (s: string) => void;
  group: FulfillmentGroup;
  changeAllocation: (productId: number, index: number, quantity: number) => void;
}) {
  return cart.length ? (
    <>
      <div className="cart-list">
        {cart.map(({ product: p, quantity: q, allocations }) => (
          <div className="cart-row" key={p.id}>
            <div className="cart-thumb">
              <FoodImage src={p.image_preview_url} alt="" fallback={<span>C</span>} />
            </div>
            <div className="cart-description">
              <strong>{p.name}</strong>
              <small>
                {storageLabel[p.storage_type]} · {money(p.price_bani)}
              </small>
              {allocations?.map((a, index) => <small key={index}>Ziua {a.day_index} · {a.member_label}: <input aria-label={`Cantitate ${p.name}, ziua ${a.day_index}, ${a.member_label}`} type="number" min="0" max="1000" value={a.quantity} onChange={e => changeAllocation(p.id, index, Number(e.target.value))} /></small>)}
              <button className="text-button" onClick={() => change(p.id, 0)}>
                Elimină
              </button>
            </div>
            <div className="quantity">
              <button
                onClick={() => change(p.id, q - 1)}
                aria-label={`Scade cantitatea pentru ${p.name}`}
              >
                <Icon name="minus" />
              </button>
              <span>{q}</span>
              <button
                onClick={() => change(p.id, q + 1)}
                aria-label={`Mărește cantitatea pentru ${p.name}`}
              >
                <Icon name="plus" />
              </button>
            </div>
            <strong>{money(p.price_bani * q)}</strong>
          </div>
        ))}
      </div>
      <button className="text-button" onClick={clear}>
        Golește coșul pentru o comandă separată
      </button>
      <div className="cart-summary">
        <div>
          <span>Subtotal estimat</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <p>
          Minim 600 MDL per comandă. Mai ai nevoie de {money(Math.max(0, 60000 - subtotal))}; zona poate avea un minim mai mare.
        </p>
        <button onClick={() => navigate(group === "frozen" ? "/checkout/congelate" : "/checkout")}>
          Continuă spre livrare <Icon name="arrow" />
        </button>
      </div>
    </>
  ) : (
    <div className="state empty">
      <h2>Coșul tău este gol.</h2>
      <p>Descoperă produsele și alege ce ți se potrivește.</p>
      <button onClick={() => navigate(group === "frozen" ? "/congelate" : "/catalog")}>Explorează produsele</button>
    </div>
  );
}
function Checkout({
  mode,
  group,
  cart,
  subtotal,
  navigate,
  updateProducts,
  onSuccess,
}: {
  mode: Mode;
  group: FulfillmentGroup;
  cart: CartItem[];
  subtotal: number;
  navigate: (s: string) => void;
  updateProducts: (products: Product[]) => void;
  onSuccess: (v: OrderCreated, delivery_at?: string) => void;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [windowId, setWindowId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    (mode === "demo" ? Promise.resolve(demoZones) : api.zones())
      .then((v) => {
        if (active) setZones(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    let active = true;
    setWindowId("");
    setWindows([]);
    if (!zoneId) return;
    (mode === "demo"
      ? Promise.resolve(demoWindows(Number(zoneId), group))
      : api.windows(Number(zoneId), group)
    )
      .then((v) => {
        if (active) setWindows(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [zoneId, mode, group]);
  const zone = zones.find((z) => z.id === Number(zoneId));
  const compatible =
    cart.length > 0 &&
    cart.every(
      (i) =>
        i.product.storage_type === cart[0].product.storage_type &&
        i.product.fulfillment_group === group &&
        ["fresh", "chilled", "frozen"].includes(i.product.storage_type),
    );
  const minimum = Math.max(60000, zone?.minimum_basket_bani ?? 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !zone || !windowId || subtotal < minimum || !compatible) return;
    setError("");
    const form = new FormData(e.currentTarget);
    const lat = String(form.get("latitude") || "").trim();
    const lon = String(form.get("longitude") || "").trim();
    if (Boolean(lat) !== Boolean(lon)) {
      setError(
        "Introdu atât latitudinea, cât și longitudinea, sau lasă ambele câmpuri goale.",
      );
      return;
    }
    const data: OrderInput = {
      fulfillment_group: group,
      customer_name: String(form.get("name") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      address: String(form.get("address") || "").trim(),
      zone_id: zone.id,
      delivery_window_id: Number(windowId),
      latitude: lat ? Number(lat) : null,
      longitude: lon ? Number(lon) : null,
      coordinate_source: lat ? "manual_map_pin" : null,
      delivery_instructions:
        String(form.get("instructions") || "").trim() || null,
      items: cart.map((i) => ({
        product_id: i.product.id,
        quantity: i.quantity,
        custom_quantity: i.allocations?.reduce((n, a) => n + a.quantity, 0) || 0,
      })),
      allocations: cart.flatMap(i => i.allocations || []),
      menu_days: cart.some(i => i.allocations?.length) ? Math.max(...cart.map(i => i.menu_days || 0), ...cart.flatMap(i => (i.allocations || []).map(a => a.day_index))) : null,
    };
    if (
      lat &&
      (!Number.isFinite(data.latitude) ||
        !Number.isFinite(data.longitude) ||
        Math.abs(data.latitude!) > 90 ||
        Math.abs(data.longitude!) > 180)
    ) {
      setError("Coordonatele nu sunt valide.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "live") {
        const [freshProducts, freshZones, freshWindows] = await Promise.all([
          api.products(),
          api.zones(),
          api.windows(zone.id, group),
        ]);
        const currentZone = freshZones.find((item) => item.id === zone.id);
        const currentWindow = freshWindows.find(
          (item) => item.id === Number(windowId),
        );
        const zoneChanged = currentZone && (
          currentZone.minimum_basket_bani !== zone.minimum_basket_bani ||
          currentZone.delivery_fee_bani !== zone.delivery_fee_bani
        );
        // Update the displayed estimate before asking for another submission.
        setZones(freshZones);
        setWindows(freshWindows);
        if (!currentZone || !currentZone.active) {
          setZoneId("");
          setError(
            "Zona selectată nu mai este disponibilă. Alege o altă zonă.",
          );
          return;
        }
        if (
          !currentWindow ||
          currentWindow.zone_id !== zone.id ||
          currentWindow.fulfillment_group !== group ||
          currentWindow.active === false ||
          (currentWindow.capacity != null &&
            currentWindow.reserved_orders != null &&
            currentWindow.reserved_orders >= currentWindow.capacity) ||
          !Number.isFinite(Date.parse(currentWindow.ordering_cutoff)) ||
          !Number.isFinite(Date.parse(currentWindow.delivery_at)) ||
          Date.parse(currentWindow.ordering_cutoff) <= Date.now() ||
          Date.parse(currentWindow.delivery_at) <= Date.now()
        ) {
          setWindowId("");
          setError(
            "Intervalul selectat nu mai este disponibil. Alege alt interval.",
          );
          return;
        }
        const missing = cart.filter(
          (item) =>
            !freshProducts.some(
              (p) => p.id === item.product.id && p.available && !p.demo_only && p.fulfillment_group === group,
            ),
        );
        if (missing.length) {
          setError(
            `Aceste produse nu mai sunt disponibile: ${missing.map((item) => item.product.name).join(", ")}. Elimină-le din coș.`,
          );
          return;
        }
        const changed = cart.some(({ product }) => {
          const current = freshProducts.find((item) => item.id === product.id)!;
          return (
            current.price_bani !== product.price_bani ||
            current.storage_type !== product.storage_type
          );
        });
        if (changed) {
          updateProducts(freshProducts);
          setError(
            "Prețul sau condițiile de păstrare s-au schimbat. Verifică din nou coșul înainte de a trimite cererea." +
              (zoneChanged ? " Condițiile de livrare s-au schimbat. Verifică noul minim și taxa." : ""),
          );
          return;
        }
        if (zoneChanged) {
          setError(
            "Condițiile de livrare s-au schimbat. Verifică noul minim și taxa înainte de a continua.",
          );
          return;
        }
      }
      const order =
        mode === "demo"
          ? {
              id: 0,
              subtotal_bani: subtotal,
              delivery_fee_bani: zone.delivery_fee_bani,
              total_bani: subtotal + zone.delivery_fee_bani,
              status: "requested",
            }
          : await api.order(data);
      onSuccess(order, windows.find(w => w.id === Number(windowId))?.delivery_at);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Cererea nu a putut fi trimisă.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="container page">
      <button className="text-button back" onClick={() => navigate(group === "frozen" ? "/cos/congelate" : "/cos")}>
        ← Înapoi la coș
      </button>
      <div className="page-heading">
        <div>
          <p className="overline">LIVRARE PROGRAMATĂ</p>
          <h1>Unde livrăm?</h1>
          <p>Completează datele pentru a trimite o cerere de comandă.</p>
        </div>
      </div>
      {!cart.length ? (
        <div className="state empty">
          <p>Coșul este gol.</p>
          <button onClick={() => navigate(group === "frozen" ? "/congelate" : "/catalog")}>Vezi produsele</button>
        </div>
      ) : (
        <form className="checkout-layout" onSubmit={submit}>
          <div className="form-stack">
            <h2>Date de contact</h2>
            <div className="form-grid">
              <label>
                Nume și prenume
                <input
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Telefon
                <input
                  name="phone"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  type="tel"
                />
              </label>
            </div>
            <label>
              Adresa de livrare
              <input
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                maxLength={300}
                autoComplete="street-address"
                placeholder="Strada, numărul, apartamentul"
              />
            </label>
            <div className="form-grid">
              <label>
                Zona de livrare
                <select
                  value={zoneId}
                  onChange={(e) => {
                    setError("");
                    setZoneId(e.target.value);
                  }}
                  required
                >
                  <option value="">
                    {loading ? "Se încarcă…" : "Selectează zona"}
                  </option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.city} · {z.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Interval de livrare
                <select
                  value={windowId}
                  onChange={(e) => setWindowId(e.target.value)}
                  required
                  disabled={!zoneId}
                >
                  <option value="">
                    {zoneId && !windows.length
                      ? "Niciun interval disponibil"
                      : "Selectează intervalul"}
                  </option>
                  {windows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {dateTime(w.delivery_at)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              Orele sunt afișate în fusul orar Chișinău. Zona selectată și
              coordonatele nu sunt verificate geografic.
            </p>
            <label>
              Instrucțiuni pentru livrare <span>(opțional)</span>
              <textarea
                name="instructions"
                rows={3}
                maxLength={1000}
                placeholder="De exemplu: intrarea, etajul"
              />
            </label>
            <LocationPicker address={address} onAddress={setAddress} />
          </div>
          <aside className="checkout-summary">
            <h2>Rezumatul cererii</h2>
            <div>
              <span>Produse</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Livrare estimată</span>
              <strong>
                {zone ? money(zone.delivery_fee_bani) : "Selectează zona"}
              </strong>
            </div>
            <div className="total">
              <span>Total estimat</span>
              <strong>
                {zone
                  ? money(subtotal + zone.delivery_fee_bani)
                  : money(subtotal)}
              </strong>
            </div>
            {zone && (
              <p>
                Minimul pentru această zonă: {money(minimum)}.
                {subtotal < minimum &&
                  ` Mai adaugă ${money(minimum - subtotal)}.`}
              </p>
            )}
            {!compatible && (
              <p className="error">
                Produsele trebuie să aibă același tip de păstrare validat.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={
                busy || !zone || !windowId || subtotal < minimum || !compatible
              }
            >
              {busy
                ? "Se trimite…"
                : mode === "demo"
                  ? "Simulează cererea"
                  : "Trimite cererea"}
            </button>
            <p>
              Nu se încasează plată. Cererea devine comandă confirmată doar după
              verificare.
            </p>
          </aside>
        </form>
      )}
    </section>
  );
}
