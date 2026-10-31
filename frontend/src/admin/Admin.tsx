import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  dateTime,
  money,
  onUnauthorized,
  type Batch,
  type BatchSummary,
  type Costs,
  type Financial,
  type Order,
  type OrderDetail,
  type Production,
  type Zone,
  type Window,
} from "../api";
import Manage from "./Manage";

type Tab =
  "overview" | "orders" | "batches" | "products" | "zones" | "windows" | "map";
const titles: Record<Tab, string> = {
  overview: "Privire de ansamblu",
  orders: "Comenzi",
  batches: "Loturi de livrare",
  products: "Produse",
  zones: "Zone de livrare",
  windows: "Intervale de livrare",
  map: "Harta livrărilor",
};
const statusLabels: Record<string, string> = {
  requested: "Solicitată",
  confirmed: "Confirmată",
  packed: "Ambalată",
  dispatched: "Expediată",
  delivered: "Livrată",
};
const nextStatus: Record<string, string> = {
  requested: "confirmed",
  confirmed: "packed",
  packed: "dispatched",
  dispatched: "delivered",
};
export default function Admin({
  navigate,
  path,
}: {
  navigate: (s: string) => void;
  path: string;
}) {
  const [token, setToken] = useState("");
  const [entry, setEntry] = useState("");
  const candidate = path.replace(/^\/admin\/?/, "").replace(/\/$/, "");
  const tab: Tab = Object.prototype.hasOwnProperty.call(titles, candidate)
    ? (candidate as Tab)
    : "overview";
  const goToTab = (next: Tab) =>
    navigate(next === "overview" ? "/admin" : `/admin/${next}`);
  const [message, setMessage] = useState("");
  useEffect(() => {
    onUnauthorized(() => {
      setToken("");
      setMessage(
        "Sesiunea a expirat sau tokenul este invalid. Introdu tokenul din nou.",
      );
    });
  }, []);
  async function signIn(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await api.adminGet("/orders?limit=1", entry);
      setToken(entry);
      setEntry("");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Autentificarea nu a reușit.",
      );
    }
  }
  if (!token)
    return (
      <div className="admin-login">
        <button className="text-button" onClick={() => navigate("/")}>
          ← Înapoi la magazin
        </button>
        <div className="login-panel">
          <span className="brand-symbol">C</span>
          <h1>Administrare CREDEM</h1>
          <p>
            Introdu tokenul de administrator pentru această sesiune. Tokenul
            rămâne doar în memoria paginii.
          </p>
          <form onSubmit={signIn}>
            <label>
              Token de acces
              <input
                type="password"
                autoComplete="off"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                required
              />
            </label>
            {message && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            <button>Intră în administrare</button>
          </form>
          <p className="hint">
            Acces temporar pentru demonstrație; nu reprezintă autentificare de
            producție.
          </p>
        </div>
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button className="admin-brand" onClick={() => navigate("/")}>
          CREDEM <small>HOME</small>
        </button>
        <p>Administrare</p>
        <nav aria-label="Administrare">
          {(Object.keys(titles) as Tab[]).map((key) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => goToTab(key)}
            >
              {titles[key]}
            </button>
          ))}
        </nav>
        <button
          className="logout"
          onClick={() => {
            setToken("");
            setEntry("");
          }}
        >
          Ieși din cont
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <div>
            <span>CREDEM HOME / ADMINISTRARE</span>
            <h1>{titles[tab]}</h1>
          </div>
          <button className="button-outline" onClick={() => navigate("/")}>
            Vezi magazinul
          </button>
        </header>
        <div className="admin-content">
          {tab === "overview" ? (
            <Overview token={token} openOrders={() => goToTab("orders")} />
          ) : tab === "orders" ? (
            <Orders token={token} openBatches={() => goToTab("batches")} />
          ) : tab === "batches" ? (
            <Batches token={token} />
          ) : (
            <Manage tab={tab} token={token} />
          )}
        </div>
      </div>
    </div>
  );
}
function Overview({
  token,
  openOrders,
}: {
  token: string;
  openOrders: () => void;
}) {
  const [demo, setDemo] = useState("false");
  const [offset, setOffset] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setOrders([]);
    setError("");
    api
      .adminGet<Order[]>(
        `/orders?limit=25&offset=${offset}&is_demo=${demo}`,
        token,
      )
      .then((data) => {
        if (current) setOrders(data);
      })
      .catch((err) => {
        if (current) setError(err.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [token, demo, offset]);
  const zones = orders.reduce<Record<number, number>>((counts, order) => {
    counts[order.zone_id] = (counts[order.zone_id] || 0) + 1;
    return counts;
  }, {});
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Activitate recentă</h2>
          <p>Valorile acoperă doar pagina afișată, nu toate comenzile.</p>
        </div>
        <button onClick={openOrders}>Vezi comenzile</button>
      </div>
      <div className="filters">
        <label>
          Tip date
          <select
            value={demo}
            onChange={(event) => {
              setDemo(event.target.value);
              setOffset(0);
            }}
          >
            <option value="false">Reale</option>
            <option value="true">Simulate</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="state">Se încarcă comenzile…</p>
      ) : (
        <>
          <div className="metrics">
            <div>
              <span>Comenzi pe pagină</span>
              <strong>{orders.length}</strong>
            </div>
            <div>
              <span>Valoare solicitată pe pagină</span>
              <strong>
                {money(
                  orders.reduce((sum, order) => sum + order.total_bani, 0),
                )}
              </strong>
            </div>
            <div>
              <span>Date afișate</span>
              <strong>{demo === "true" ? "Simulate" : "Reale"}</strong>
            </div>
          </div>
          <section className="admin-section">
            <h2>Comenzi pe zonă</h2>
            {Object.entries(zones).length ? (
              Object.entries(zones).map(([id, count]) => (
                <p key={id}>
                  Zona #{id}: {count}
                </p>
              ))
            ) : (
              <p>Nu există comenzi pe această pagină.</p>
            )}
          </section>
        </>
      )}
      <div className="pagination">
        <button
          className="button-outline"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
        >
          Înapoi
        </button>
        <span>De la {offset + 1}</span>
        <button
          className="button-outline"
          disabled={loading || orders.length < 25}
          onClick={() => setOffset(offset + 25)}
        >
          Înainte
        </button>
      </div>
    </>
  );
}
function Badge({ demo }: { demo: boolean }) {
  return (
    <span className={demo ? "badge badge-demo" : "badge"}>
      {demo ? "SIMULAT" : "REAL"}
    </span>
  );
}
function Orders({
  token,
  openBatches,
}: {
  token: string;
  openBatches: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [demo, setDemo] = useState("false");
  const [zone, setZone] = useState("");
  const [win, setWin] = useState("");
  const [status, setStatus] = useState("");
  const [unbatched, setUnbatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const q = new URLSearchParams({
      limit: "25",
      offset: String(offset),
      is_demo: demo,
    });
    if (zone) q.set("zone_id", zone);
    if (win) q.set("window_id", win);
    if (status) q.set("status", status);
    if (unbatched) q.set("unbatched", "true");
    try {
      setOrders(await api.adminGet<Order[]>(`/orders?${q}`, token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nu se pot încărca comenzile.");
    } finally {
      setLoading(false);
    }
  }, [token, offset, demo, zone, win, status, unbatched]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    Promise.all([
      api.adminGet<Zone[]>("/delivery-zones", token),
      api.adminGet<Window[]>("/delivery-windows", token),
    ])
      .then(([z, w]) => {
        setZones(z);
        setWindows(w);
      })
      .catch((e) => setErr(e.message));
  }, [token]);
  async function open(id: number) {
    try {
      setDetail(await api.adminGet<OrderDetail>(`/orders/${id}`, token));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function advance() {
    if (!detail) return;
    setBusy(true);
    try {
      await api.adminPatch(
        `/orders/${detail.id}/status`,
        { status: nextStatus[detail.status] },
        token,
      );
      await open(detail.id);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Comenzile tale</h2>
          <p>
            Lista prezintă date din API. Valorile de mai jos acoperă doar pagina
            afișată.
          </p>
        </div>
        <button onClick={openBatches}>Gestionează loturile →</button>
      </div>
      <div className="metrics">
        <div>
          <span>Comenzi pe pagină</span>
          <strong>{orders.length}</strong>
        </div>
        <div>
          <span>Valoare solicitată pe pagină</span>
          <strong>{money(orders.reduce((s, o) => s + o.total_bani, 0))}</strong>
        </div>
        <div>
          <span>Tip date afișat</span>
          <strong>{demo === "true" ? "Simulate" : "Reale"}</strong>
        </div>
      </div>
      <div className="filters">
        <label>
          Tip
          <select
            value={demo}
            onChange={(e) => {
              setOffset(0);
              setDemo(e.target.value);
            }}
          >
            <option value="false">Reale</option>
            <option value="true">Simulate</option>
          </select>
        </label>
        <label>
          Zonă
          <select
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              setWin("");
              setOffset(0);
            }}
          >
            <option value="">Toate</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Interval
          <select
            value={win}
            onChange={(e) => {
              setWin(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Toate</option>
            {windows
              .filter((w) => !zone || w.zone_id === Number(zone))
              .filter((w) => Boolean(w.is_demo) === (demo === "true"))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {dateTime(w.delivery_at)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Stare
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Toate</option>
            {Object.entries(statusLabels).map(([s, l]) => (
              <option value={s} key={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={unbatched}
            onChange={(e) => {
              setUnbatched(e.target.checked);
              setOffset(0);
            }}
          />{" "}
          Fără lot
        </label>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      {loading ? (
        <p className="state">Se încarcă comenzile…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Comandă</th>
                <th>Client</th>
                <th>Livrare</th>
                <th>Stare</th>
                <th>Valoare</th>
                <th>Lot</th>
                <th>Livrare</th>
                <th>Tip</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="table-link" onClick={() => open(o.id)}>
                      #{o.id}
                    </button>
                  </td>
                  <td>{o.customer_name}</td>
                  <td>{dateTime(o.delivery_at)}</td>
                  <td>{statusLabels[o.status] || o.status}</td>
                  <td>{money(o.total_bani)}</td>
                  <td>
                    {o.delivery_batch_id ? `#${o.delivery_batch_id}` : "—"}
                  </td>
                  <td>{o.fulfillment_group === "meals" ? "Mese" : o.fulfillment_group === "frozen" ? "Congelate" : "Neclasificat"}</td>
                  <td>
                    <Badge demo={o.is_demo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && (
            <p className="state">
              Nu există comenzi pentru filtrele selectate.
            </p>
          )}
        </div>
      )}
      <div className="pagination">
        <button
          className="button-outline"
          onClick={() => setOffset(Math.max(0, offset - 25))}
          disabled={!offset}
        >
          Înapoi
        </button>
        <span>De la {offset + 1}</span>
        <button
          className="button-outline"
          onClick={() => setOffset(offset + 25)}
          disabled={orders.length < 25}
        >
          Înainte
        </button>
      </div>
      {detail && (
        <section className="detail-panel" aria-label="Detalii comandă">
          <div className="section-heading">
            <div>
              <h2>
                Comanda #{detail.id} <Badge demo={detail.is_demo} />
              </h2>
              <p>
                {statusLabels[detail.status] || detail.status} ·{" "}
                {dateTime(detail.delivery_at)}
              </p>
              <p>Grup: {detail.fulfillment_group === "meals" ? "Mese" : detail.fulfillment_group === "frozen" ? "Congelate" : "Istoric / neclasificat"}</p>
            </div>
            <button className="text-button" onClick={() => setDetail(null)}>
              Închide
            </button>
          </div>
          <div className="admin-details">
            <div>
              <h3>Client</h3>
              <p>
                {detail.customer_name}
                <br />
                {detail.phone}
                <br />
                {detail.address}
              </p>
              <p>
                {detail.delivery_instructions ||
                  "Fără instrucțiuni suplimentare."}
              </p>
              <p>Locație: {detail.location_verification_status}</p>
            </div>
            <div>
              <h3>Produse</h3>
              {detail.items.map((i, index) => (
                <p key={`${i.product_id}-${index}`}>
                  {i.quantity} × {i.product_name || `Produs #${i.product_id}`}{" "}
                  <strong>{money(i.line_total_bani)}</strong>
                </p>
              ))}
              {Boolean(detail.allocations?.length) && <><h3>Meniul familiei · {detail.menu_days} zile</h3>{detail.allocations?.map((a, index) => <p key={index}>Ziua {a.day_index} · {a.member_label} · {a.meal_period === "breakfast" ? "Mic dejun" : a.meal_period === "lunch" ? "Prânz" : a.meal_period === "dinner" ? "Cină" : "Fără categorie"}: {a.product_name_snapshot} × {a.quantity}</p>)}</>}
              <p>Livrare: {money(detail.delivery_fee_bani)}</p>
              <p>
                <strong>Total solicitat: {money(detail.total_bani)}</strong>
              </p>
            </div>
          </div>
          {nextStatus[detail.status] && (
            <button disabled={busy} onClick={advance}>
              Marchează: {statusLabels[nextStatus[detail.status]]}
            </button>
          )}
        </section>
      )}
    </>
  );
}
function Batches({ token }: { token: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [demo, setDemo] = useState("false");
  const [selected, setSelected] = useState<OrderDetail[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [production, setProduction] = useState<Production | null>(null);
  const [finance, setFinance] = useState<Financial | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [packing, setPacking] = useState<{
    orders: {
      order_id: number;
      customer_name: string;
      items: { name: string; quantity: number; unit: string | null }[];
    }[];
  } | null>(null);
  const [manifest, setManifest] = useState<{
    stops: { order_id: number; customer_name: string; address: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [b, o] = await Promise.all([
        api.adminGet<Batch[]>("/batches", token),
        api.adminGet<Order[]>(
          `/orders?unbatched=true&limit=100&is_demo=${demo}`,
          token,
        ),
      ]);
      setBatches(b);
      setOrders(
        o.filter((x) =>
          ["requested", "confirmed", "packed"].includes(x.status),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, demo]);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggle(o: Order) {
    setError("");
    if (selected.some((s) => s.id === o.id)) {
      setSelected(selected.filter((s) => s.id !== o.id));
      return;
    }
    try {
      const detail = await api.adminGet<OrderDetail>(`/orders/${o.id}`, token);
      const types = new Set(detail.items.map((i) => i.storage_type_snapshot));
      const first = selected[0];
      if (
        types.size !== 1 ||
        ![...types].every(
          (t) => t && ["fresh", "chilled", "frozen"].includes(t),
        )
      ) {
        setError("Această comandă nu are un tip de păstrare unic și validat.");
        return;
      }
      if (
        first &&
        (first.zone_id !== o.zone_id ||
          first.delivery_window_id !== o.delivery_window_id ||
          first.is_demo !== o.is_demo ||
          first.fulfillment_group !== o.fulfillment_group ||
          first.items[0]?.storage_type_snapshot !==
            detail.items[0]?.storage_type_snapshot)
      ) {
        setError(
          "Alege comenzi cu aceeași zonă, același interval și același tip de păstrare.",
        );
        return;
      }
      setSelected([...selected, detail]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create() {
    if (!selected.length) return;
    setBusy(true);
    setError("");
    try {
      const b = await api.adminPost<Batch>(
        "/batches",
        {
          zone_id: selected[0].zone_id,
          delivery_window_id: selected[0].delivery_window_id,
          order_ids: selected.map((o) => o.id),
        },
        token,
      );
      setSelected([]);
      await load();
      await open(b.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: number) {
    setError("");
    try {
      const [b, s, p, f, c, pack, manifestData] = await Promise.all([
        api.adminGet<Batch>(`/batches/${id}`, token),
        api.adminGet<BatchSummary>(`/batches/${id}/summary`, token),
        api.adminGet<Production>(`/batches/${id}/production`, token),
        api.adminGet<Financial>(`/batches/${id}/financial-summary`, token),
        api.adminGet<Costs>(`/batches/${id}/costs`, token),
        api.adminGet<typeof packing>(`/batches/${id}/packing-list`, token),
        api.adminGet<typeof manifest>(
          `/batches/${id}/delivery-manifest`,
          token,
        ),
      ]);
      setBatch(b);
      setSummary(s);
      setProduction(p);
      setFinance(f);
      setCosts(c);
      setPacking(pack);
      setManifest(manifestData);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveCosts(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!batch || !costs) return;
    setBusy(true);
    try {
      await api.adminPatch(
        `/batches/${batch.id}/costs`,
        {
          estimate_kind: costs.estimate_kind,
          estimated_transport_bani: costs.estimated_transport_bani,
          estimated_packaging_per_order_bani:
            costs.estimated_packaging_per_order_bani,
        },
        token,
      );
      await open(batch.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(type: "orders" | "production") {
    if (!batch) return;
    try {
      await api.download(
        `/batches/${batch.id}/exports/${type}.csv`,
        token,
        `lot-${batch.id}-${type}.csv`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Pregătește livrările împreună</h2>
          <p>
            Grupează comenzi compatibile și consultă estimările. Rutele nu sunt
            optimizate.
          </p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="admin-section">
        <div className="section-heading">
          <div>
            <h2>Creează un lot</h2>
            <p>
              Comenzile trebuie să aibă aceeași zonă, interval și temperatură.
            </p>
          </div>
          <label>
            Tip
            <select
              value={demo}
              onChange={(e) => {
                setSelected([]);
                setDemo(e.target.value);
              }}
            >
              <option value="false">Reale</option>
              <option value="true">Simulate</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Selectează</th>
                <th>Comandă</th>
                <th>Client</th>
                <th>Zonă / interval</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selectează comanda ${o.id}`}
                      checked={selected.some((s) => s.id === o.id)}
                      onChange={() => void toggle(o)}
                    />
                  </td>
                  <td>#{o.id}</td>
                  <td>{o.customer_name}</td>
                  <td>
                    #{o.zone_id} · {dateTime(o.delivery_at)} · {o.fulfillment_group || "neclasificat"}
                  </td>
                  <td>{money(o.total_bani)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && (
            <p className="state">
              Nu există comenzi eligibile în primele 100 de rezultate.
            </p>
          )}
        </div>
        <p className="hint">Se afișează până la 100 de comenzi nealocate.</p>
        <button disabled={!selected.length || busy} onClick={create}>
          Creează lotul ({selected.length})
        </button>
      </section>
      <section className="admin-section">
        <h2>Loturi existente</h2>
        <div className="batch-list">
          {batches.map((b) => (
            <button
              key={b.id}
              className="batch-row"
              onClick={() => void open(b.id)}
            >
              <span>
                <strong>Lot #{b.id}</strong> · Zona #{b.zone_id} · Interval #
                {b.delivery_window_id}
                {` · ${b.fulfillment_group || "istoric"}`}
              </span>
              <span>
                {b.storage_type} <Badge demo={b.is_demo} />
              </span>
            </button>
          ))}
          {!batches.length && <p>Nu există loturi.</p>}
        </div>
      </section>
      {batch && summary && finance && costs && (
        <section className="detail-panel">
          <div className="section-heading">
            <div>
              <h2>
                Lot #{batch.id} <Badge demo={batch.is_demo} />
              </h2>
              <p>
                {summary.household_count} gospodării ·{" "}
                {summary.total_item_quantity} produse ·{" "}
                {summary.total_weight_g == null
                  ? `greutate parțială ${summary.known_weight_g} g`
                  : `${summary.total_weight_g} g`}
              </p>
            </div>
            <button className="text-button" onClick={() => setBatch(null)}>
              Închide
            </button>
          </div>
          <div className="metrics">
            <div>
              <span>Valoare solicitată</span>
              <strong>{money(finance.revenue_bani)}</strong>
            </div>
            <div>
              <span>Transport / gospodărie</span>
              <strong>{money(finance.delivery_cost_per_household_bani)}</strong>
            </div>
            <div>
              <span>Contribuție estimată</span>
              <strong>
                {money(finance.contribution_before_overhead_bani)}
              </strong>
            </div>
          </div>
          {!finance.estimate_complete && (
            <p className="warning">
              Estimare incompletă. Completează costurile transportului,
              ambalajului și produselor; datele necunoscute nu sunt considerate
              zero.
            </p>
          )}
          <div className="admin-details">
            <div>
              <h3>Producție</h3>
              {production?.products.map((p, i) => (
                <p key={`${p.product_id}-${i}`}>
                  {p.name}:{" "}
                  <strong>
                    {p.quantity} {p.unit || "unități nespecificate"}
                  </strong>{" "}
                  ·{" "}
                  {p.total_weight_g == null
                    ? "greutate incompletă"
                    : `${p.total_weight_g} g`}
                </p>
              ))}
              <h3>Ambalare</h3>
              {packing?.orders.map((o) => (
                <p key={o.order_id}>
                  #{o.order_id} {o.customer_name}:{" "}
                  {o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
                </p>
              ))}
              <h3>Livrări (ordine neoptimizată)</h3>
              {manifest?.stops.map((o) => (
                <p key={o.order_id}>
                  #{o.order_id} {o.customer_name} · {o.address}
                </p>
              ))}
              <div className="actions">
                <button
                  className="button-outline"
                  onClick={() => void download("orders")}
                >
                  CSV comenzi
                </button>
                <button
                  className="button-outline"
                  onClick={() => void download("production")}
                >
                  CSV producție
                </button>
              </div>
            </div>
            <div>
              <h3>Estimare financiară</h3>
              <p>Cost produse: {money(finance.estimated_food_cost_bani)}</p>
              {finance.estimated_food_cost_bani === null && (
                <p>
                  Cost cunoscut parțial: {money(finance.known_food_cost_bani)}
                </p>
              )}
              {finance.unpriced_products.length > 0 && (
                <>
                  <p>Produse care necesită verificare:</p>
                  <ul>
                    {finance.unpriced_products.map((item) => (
                      <li key={`${item.product_id}-${item.reason}`}>
                        {production?.products.find(
                          (p) => p.product_id === item.product_id,
                        )?.name || `Produs #${item.product_id}`}
                        :{" "}
                        {(
                          {
                            missing_cost: "cost lipsă",
                            unknown_order_unit:
                              "unitatea comenzii este necunoscută",
                            unit_or_weight_changed:
                              "unitatea sau greutatea s-a schimbat",
                          } as Record<string, string>
                        )[item.reason] || item.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>
                Cost ambalare: {money(finance.estimated_packaging_cost_bani)}
              </p>
              <p>Cost transport: {money(finance.estimated_transport_bani)}</p>
              <p>
                Comenzi necesare pentru transport:{" "}
                {finance.orders_needed_to_cover_transport ?? "Indisponibil"}
              </p>
              <form className="form-stack" onSubmit={saveCosts}>
                <label>
                  Tip estimare
                  <select
                    value={costs.estimate_kind || ""}
                    onChange={(e) =>
                      setCosts({
                        ...costs,
                        estimate_kind: (e.target.value ||
                          null) as Costs["estimate_kind"],
                      })
                    }
                  >
                    <option value="">Nespecificat</option>
                    <option value="demo">Demonstrativă</option>
                    {!batch.is_demo && (
                      <option value="operational">Operațională</option>
                    )}
                  </select>
                </label>
                <label>
                  Transport estimat (bani)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={costs.estimated_transport_bani ?? ""}
                    onChange={(e) =>
                      setCosts({
                        ...costs,
                        estimated_transport_bani:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Ambalaj per comandă (bani)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={costs.estimated_packaging_per_order_bani ?? ""}
                    onChange={(e) =>
                      setCosts({
                        ...costs,
                        estimated_packaging_per_order_bani:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <button disabled={busy}>Salvează estimarea</button>
              </form>
              <p className="hint">
                Contribuția estimată nu este profit net sau încasare.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
