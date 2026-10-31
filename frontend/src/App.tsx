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
} from "./api";
import { demoProducts, demoWindows, demoZones } from "./demo";
import Admin from "./admin/Admin";
import LocationPicker from "./components/LocationPicker";

type CartItem = { product: Product; quantity: number };
type Mode = "live" | "demo";
type Confirmation = { order: OrderCreated; demo: boolean };
const readCart = (mode: Mode): CartItem[] => {
  try {
    const data = JSON.parse(
      sessionStorage.getItem(`credem-cart-${mode}`) || "[]",
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};
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
  const navigate = useCallback((url: string) => {
    history.pushState({}, "", url);
    setPath(url);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const fn = () => setPath(location.pathname);
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  const [mode, setMode] = useState<Mode>(() =>
    sessionStorage.getItem("credem-mode") === "demo" ? "demo" : "live",
  );
  const [carts, setCarts] = useState<Record<Mode, CartItem[]>>(() => ({
    live: readCart("live"),
    demo: readCart("demo"),
  }));
  const cart = carts[mode];
  const setCart = (fn: (current: CartItem[]) => CartItem[]) =>
    setCarts((current) => {
      const next = fn(current[mode]);
      sessionStorage.setItem(`credem-cart-${mode}`, JSON.stringify(next));
      return { ...current, [mode]: next };
    });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Confirmation | null>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("credem-confirmation") || "null",
      );
    } catch {
      return null;
    }
  });
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
            ? { ...i, quantity: Math.max(0, Math.min(1000, quantity)) }
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
  const subtotal = cart.reduce(
    (sum, i) => sum + i.product.price_bani * i.quantity,
    0,
  );
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartChanges =
    mode === "live" && !loading && !error
      ? cart.filter(({ product }) => {
          const current = products.find(
            (item) => item.id === product.id && item.available && !item.demo_only,
          );
          return (
            !current ||
            current.price_bani !== product.price_bani ||
            current.storage_type !== product.storage_type
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
        <nav className="nav" aria-label="Navigare principală">
          <a href="/planuri" onClick={(e) => link(e, "/planuri")}>
            Planuri de mese
          </a>
          <a href="/catalog" onClick={(e) => link(e, "/catalog")}>
            Construiește cutia
          </a>
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
            href="/cos"
            onClick={(e) => link(e, "/cos")}
            aria-label={`Coș: ${count} produse`}
          >
            <Icon name="bag" />
            <span>Coș</span>
            <b>{count}</b>
          </a>
        </div>
      </header>
      {mode === "demo" && (
        <div className="demo-banner">
          Mod demonstrativ · Produsele, prețurile și comenzile sunt fictive și
          rămân doar în această sesiune.
        </div>
      )}
      <main>
        {path === "/" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="hero-intro">Mâncare pentru zile mai ușoare</p>
                <h1>
                  Mai mult timp <em>pentru acasă.</em>
                </h1>
                <p>
                  Mese pregătite cu grijă, într-o cutie livrată la momentul
                  potrivit. Alege un plan sau construiește-ți propriul coș.
                </p>
                <div className="actions">
                  <button onClick={() => navigate("/planuri")}>
                    Descoperă planurile <Icon name="arrow" />
                  </button>
                  <button
                    className="button-light"
                    onClick={() => navigate("/catalog")}
                  >
                    Construiește cutia
                  </button>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-label">
                  GUSTUL DE ACASĂ
                  <br />
                  <strong>în ritmul tău.</strong>
                </div>
                <div className="art-circle">
                  <span>
                    CREDEM
                    <br />
                    HOME
                  </span>
                </div>
                <div className="art-note">
                  Mâncare bună.
                  <br />
                  Zile mai simple.
                </div>
              </div>
            </section>
            <section className="container choice-section">
              <div className="section-heading">
                <div>
                  <h2>Tu alegi cum îți este mai ușor.</h2>
                  <p>Două moduri simple de a avea mesele mai aproape.</p>
                </div>
              </div>
              <div className="choice-grid">
                <button
                  className="choice choice-plan"
                  onClick={() => navigate("/planuri")}
                >
                  <span className="choice-mark">3 zile</span>
                  <span>
                    <strong>Un plan, mai multe mese.</strong>
                    <small>Descoperă planurile de mese</small>
                  </span>
                  <Icon name="arrow" />
                </button>
                <button
                  className="choice choice-box"
                  onClick={() => navigate("/catalog")}
                >
                  <span className="choice-mark">Pe gustul tău</span>
                  <span>
                    <strong>Cutia ta, alegerea ta.</strong>
                    <small>Explorează produsele</small>
                  </span>
                  <Icon name="arrow" />
                </button>
              </div>
              <div className="how">
                <h2>Comanzi simplu. Livrăm programat.</h2>
                <p>
                  Alege produsele, selectează o zonă și un interval disponibil,
                  apoi trimite cererea. Echipa CREDEM va verifica și confirma
                  comanda.
                </p>
              </div>
            </section>
          </>
        ) : null}
        {(path === "/catalog" || path === "/planuri") && (
          <section className="container page">
            <div className="page-heading">
              <div>
                <p className="overline">CREDEM HOME</p>
                <h1>
                  {path === "/planuri"
                    ? "Planuri de mese pentru 3 zile"
                    : "Construiește-ți cutia"}
                </h1>
                <p>
                  {path === "/planuri"
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
                products={products.filter((p) =>
                  path === "/planuri" ? p.product_type === "meal_plan" : true,
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
          />
        )}
        {path === "/cos" && (
          <section className="container page narrow">
            <div className="page-heading">
              <div>
                <p className="overline">COȘUL TĂU</p>
                <h1>Gata pentru acasă.</h1>
                <p>Revizuiește produsele înainte de a trimite cererea.</p>
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
            />
          </section>
        )}
        {path === "/checkout" && (
          <Checkout
            mode={mode}
            cart={cart}
            subtotal={subtotal}
            navigate={navigate}
            updateProducts={updateProducts}
            onSuccess={(order) => {
              const confirmation = { order, demo: mode === "demo" };
              sessionStorage.setItem(
                "credem-confirmation",
                JSON.stringify(confirmation),
              );
              setResult(confirmation);
              setCart(() => []);
              navigate("/cerere-trimisa");
            }}
          />
        )}
        {path === "/cerere-trimisa" && (
          <section className="container page narrow">
            <div className="confirmation">
              <div className="checkmark">✓</div>
              <h1>
                {result?.demo
                  ? "Cerere simulată trimisă"
                  : "Cererea a fost trimisă."}
              </h1>
              {result ? (
                <>
                  <p>
                    {result.demo
                      ? "Aceasta este o demonstrație în browser și nu a fost trimisă către CREDEM."
                      : "Îți mulțumim! Echipa CREDEM va verifica cererea. Comanda nu este încă confirmată și nu a fost efectuată nicio plată."}
                  </p>
                  <div className="receipt">
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
            <a href="/catalog" onClick={(e) => link(e, "/catalog")}>
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
        <label className="catalog-filter">
          Categorie
          <select
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
        {p.image_preview_url ? (
          <img src={p.image_preview_url} alt="" />
        ) : (
          <span className="image-placeholder">
            <span>CREDEM</span>
            <small>
              {mode === "demo" ? "PRODUS ILUSTRATIV" : "FĂRĂ FOTOGRAFIE"}
            </small>
          </span>
        )}
      </button>
      <div className="product-info">
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
        <div className="product-bottom">
          <strong>{money(p.price_bani)}</strong>
          <label className="catalog-quantity">
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
          </label>
          <button
            className="add-button"
            onClick={() => add(p, quantity)}
            disabled={p.storage_type === "pending_validation"}
            aria-label={`Adaugă ${p.name} în coș`}
          >
            <Icon name="plus" />
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
}: {
  id: number;
  mode: Mode;
  navigate: (s: string) => void;
  add: (p: Product, quantity?: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [p, setP] = useState<Product | null>(null);
  const [error, setError] = useState("");
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
      <button className="text-button back" onClick={() => navigate("/catalog")}>
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
            {p.image_detail_url ? (
              <img src={p.image_detail_url} alt={p.name} />
            ) : (
              <span className="image-placeholder">
                <span>CREDEM</span>
                <small>
                  {mode === "demo" ? "PRODUS ILUSTRATIV" : "FĂRĂ FOTOGRAFIE"}
                </small>
              </span>
            )}
          </div>
          <div>
            <p className="overline">
              {storageLabel[p.storage_type]} ·{" "}
              {p.net_weight_g ? `${p.net_weight_g} g` : p.unit}
            </p>
            <h1>{p.name}</h1>
            <p className="lead">{p.description}</p>
            <p className="detail-price">{money(p.price_bani)}</p>
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
function Cart({
  cart,
  change,
  clear,
  subtotal,
  navigate,
}: {
  cart: CartItem[];
  change: (id: number, q: number) => void;
  clear: () => void;
  subtotal: number;
  navigate: (s: string) => void;
}) {
  return cart.length ? (
    <>
      <div className="cart-list">
        {cart.map(({ product: p, quantity: q }) => (
          <div className="cart-row" key={p.id}>
            <div className="cart-thumb">
              {p.image_preview_url ? (
                <img src={p.image_preview_url} alt="" />
              ) : (
                <span>C</span>
              )}
            </div>
            <div className="cart-description">
              <strong>{p.name}</strong>
              <small>
                {storageLabel[p.storage_type]} · {money(p.price_bani)}
              </small>
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
          Minimul și taxa de livrare depind de zona selectată. Prețul final este
          calculat de server.
        </p>
        <button onClick={() => navigate("/checkout")}>
          Continuă spre livrare <Icon name="arrow" />
        </button>
      </div>
    </>
  ) : (
    <div className="state empty">
      <h2>Coșul tău este gol.</h2>
      <p>Descoperă produsele și alege ce ți se potrivește.</p>
      <button onClick={() => navigate("/catalog")}>Explorează produsele</button>
    </div>
  );
}
function Checkout({
  mode,
  cart,
  subtotal,
  navigate,
  updateProducts,
  onSuccess,
}: {
  mode: Mode;
  cart: CartItem[];
  subtotal: number;
  navigate: (s: string) => void;
  updateProducts: (products: Product[]) => void;
  onSuccess: (v: OrderCreated) => void;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [windowId, setWindowId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
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
      ? Promise.resolve(demoWindows(Number(zoneId)))
      : api.windows(Number(zoneId))
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
  }, [zoneId, mode]);
  const zone = zones.find((z) => z.id === Number(zoneId));
  const compatible =
    cart.length > 0 &&
    cart.every(
      (i) =>
        i.product.storage_type === cart[0].product.storage_type &&
        ["fresh", "chilled", "frozen"].includes(i.product.storage_type),
    );
  const minimum = zone?.minimum_basket_bani ?? 0;
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
      })),
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
          api.windows(zone.id),
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
              (p) => p.id === item.product.id && p.available && !p.demo_only,
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
      onSuccess(order);
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
      <button className="text-button back" onClick={() => navigate("/cos")}>
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
          <button onClick={() => navigate("/catalog")}>Vezi produsele</button>
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
            <LocationPicker />
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
