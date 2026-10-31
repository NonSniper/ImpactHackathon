import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  api,
  dateTime,
  money,
  storageLabel,
  type MapData,
  type MapOrder,
  type OrderDetail,
  type Product,
  type StorageType,
  type Window,
  type Zone,
} from "../api";

type Tab = "products" | "zones" | "windows" | "map";
export default function Manage({ tab, token }: { tab: Tab; token: string }) {
  if (tab === "products") return <Products token={token} />;
  if (tab === "zones") return <Zones token={token} />;
  if (tab === "windows") return <Windows token={token} />;
  return <MapPage token={token} />;
}
function Alert({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
const newProduct = () => ({
  name: "",
  description: "",
  category: "mâncare",
  price_bani: 0,
  storage_type: "pending_validation" as StorageType,
  available: false,
  demo_only: true,
  product_type: "individual_dish" as Product["product_type"],
  unit: "pack",
  net_weight_g: null as number | null,
  production_cost_bani: null as number | null,
  ingredients: "",
  allergens: "",
  preparation_instructions: "",
  supplier: "CREDEM",
});
type ProductForm = ReturnType<typeof newProduct>;
function Products({ token }: { token: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(newProduct());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(await api.adminGet<Product[]>("/products", token));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  function edit(p: Product) {
    setEditing(p.id);
    setForm({
      name: p.name,
      description: p.description,
      category: p.category,
      price_bani: p.price_bani,
      storage_type: p.storage_type,
      available: p.available,
      demo_only: p.demo_only,
      product_type: p.product_type,
      unit: p.unit,
      net_weight_g: p.net_weight_g,
      production_cost_bani: p.production_cost_bani ?? null,
      ingredients: p.ingredients || "",
      allergens: p.allergens || "",
      preparation_instructions: p.preparation_instructions || "",
      supplier: p.supplier,
    });
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const value = {
        ...form,
        ingredients: form.ingredients || null,
        allergens: form.allergens || null,
        preparation_instructions: form.preparation_instructions || null,
      };
      if (editing) await api.adminPatch(`/products/${editing}`, value, token);
      else
        await api.adminPost(
          "/products",
          { ...value, available: false, demo_only: true },
          token,
        );
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(id: number) {
    try {
      await api.adminDelete(`/products/${id}`, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Catalogul CREDEM</h2>
          <p>
            Produsele noi sunt indisponibile și demonstrative până la aprobare.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setForm(newProduct());
            setOpen(true);
          }}
        >
          Adaugă produs
        </button>
      </div>
      <Alert error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produs</th>
              <th>Preț</th>
              <th>Cost</th>
              <th>Păstrare</th>
              <th>Stare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <br />
                  <small>
                    {p.net_weight_g ? `${p.net_weight_g} g` : p.unit}
                  </small>
                </td>
                <td>{money(p.price_bani)}</td>
                <td>{money(p.production_cost_bani)}</td>
                <td>{storageLabel[p.storage_type] || p.storage_type}</td>
                <td>
                  {p.available ? "Activ" : "Inactiv"} ·{" "}
                  {p.demo_only ? "Demo" : "Aprobat"}
                </td>
                <td>
                  <button className="table-link" onClick={() => edit(p)}>
                    Editează
                  </button>{" "}
                  {p.available && (
                    <button
                      className="table-link"
                      onClick={() => void deactivate(p.id)}
                    >
                      Dezactivează
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <section className="detail-panel">
          <div className="section-heading">
            <h2>{editing ? "Editează produsul" : "Produs nou"}</h2>
            <button className="text-button" onClick={() => setOpen(false)}>
              Închide
            </button>
          </div>
          <form className="form-stack" onSubmit={save}>
            <div className="form-grid">
              <label>
                Nume
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Categorie
                <input
                  required
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Descriere
              <textarea
                required
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Preț (bani)
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={form.price_bani}
                  onChange={(e) =>
                    setForm({ ...form, price_bani: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Cost de producție (bani)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.production_cost_bani ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      production_cost_bani:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Tip produs
                <select
                  value={form.product_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      product_type: e.target.value as Product["product_type"],
                    })
                  }
                >
                  <option value="individual_dish">Preparat</option>
                  <option value="meal_plan">Plan de mese</option>
                </select>
              </label>
              <label>
                Păstrare
                <select
                  value={form.storage_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      storage_type: e.target.value as StorageType,
                    })
                  }
                >
                  {Object.entries(storageLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unitate
                <input
                  required
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </label>
              <label>
                Greutate netă (g)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.net_weight_g ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      net_weight_g:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Ingrediente
              <textarea
                value={form.ingredients}
                onChange={(e) =>
                  setForm({ ...form, ingredients: e.target.value })
                }
              />
            </label>
            <label>
              Alergeni
              <textarea
                value={form.allergens}
                onChange={(e) =>
                  setForm({ ...form, allergens: e.target.value })
                }
              />
            </label>
            <label>
              Instrucțiuni de preparare
              <textarea
                value={form.preparation_instructions}
                onChange={(e) =>
                  setForm({ ...form, preparation_instructions: e.target.value })
                }
              />
            </label>
            <label>
              Furnizor
              <input
                required
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </label>
            {editing && (
              <div className="actions">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={form.available}
                    onChange={(e) =>
                      setForm({ ...form, available: e.target.checked })
                    }
                  />{" "}
                  Disponibil
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!form.demo_only}
                    onChange={(e) =>
                      setForm({ ...form, demo_only: !e.target.checked })
                    }
                  />{" "}
                  Aprobat pentru vânzare
                </label>
              </div>
            )}
            {editing && form.available && !form.demo_only && (
              <p className="warning">
                Acest produs va fi vizibil public. Confirmă că datele și prețul
                au fost validate de CREDEM.
              </p>
            )}
            <button disabled={busy}>Salvează produsul</button>
          </form>
          {editing && <Images id={editing} token={token} reload={load} />}
        </section>
      )}
    </>
  );
}
function Images({
  id,
  token,
  reload,
}: {
  id: number;
  token: string;
  reload: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  async function convert(image: HTMLImageElement, max: number): Promise<Blob> {
    const scale = Math.min(
      1,
      max / image.naturalWidth,
      max / image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Imaginea nu a putut fi procesată.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob && blob.type === "image/webp"
            ? resolve(blob)
            : reject(Error("Conversia WebP nu este disponibilă.")),
        "image/webp",
        0.82,
      ),
    );
  }
  async function upload() {
    if (!url) return;
    setBusy(true);
    setError("");
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const [preview, detail] = await Promise.all([
        convert(image, 320),
        convert(image, 1280),
      ]);
      if (preview.size > 1048576 || detail.size > 5242880)
        throw Error(
          "Imaginea comprimată este prea mare. Alege o imagine mai mică.",
        );
      const data = new FormData();
      data.append("preview", preview, "preview.webp");
      data.append("detail", detail, "detail.webp");
      await api.upload(id, data, token);
      setFile(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-section">
      <h3>Fotografii produs</h3>
      <label>
        Alege o imagine
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      {url && (
        <img
          className="upload-preview"
          src={url}
          alt="Previzualizarea imaginii alese"
        />
      )}
      <Alert error={error} />
      <div className="actions">
        <button disabled={!file || busy} onClick={() => void upload()}>
          Încarcă imaginile
        </button>
        <button
          className="button-outline"
          onClick={() =>
            void api
              .adminDelete(`/products/${id}/images`, token)
              .then(reload)
              .catch((e) => setError(e.message))
          }
        >
          Elimină imaginile
        </button>
      </div>
    </div>
  );
}
function Zones({ token }: { token: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    city: "Chișinău",
    name: "",
    parent_zone_id: "" as string,
    active: false,
    minimum_basket_bani: 60000,
    delivery_fee_bani: 0,
  });
  const load = useCallback(async () => {
    try {
      setZones(await api.adminGet<Zone[]>("/delivery-zones", token));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  function edit(z: Zone) {
    setEditing(z.id);
    setForm({
      city: z.city,
      name: z.name,
      parent_zone_id: z.parent_zone_id ? String(z.parent_zone_id) : "",
      active: z.active,
      minimum_basket_bani: z.minimum_basket_bani,
      delivery_fee_bani: z.delivery_fee_bani,
    });
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const data = {
      ...form,
      parent_zone_id: form.parent_zone_id ? Number(form.parent_zone_id) : null,
    };
    try {
      if (editing)
        await api.adminPatch(`/delivery-zones/${editing}`, data, token);
      else await api.adminPost("/delivery-zones", data, token);
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Zone și subzone</h2>
          <p>
            O subzonă este disponibilă doar când sectorul părinte este activ.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setForm({
              city: "Chișinău",
              name: "",
              parent_zone_id: "",
              active: false,
              minimum_basket_bani: 60000,
              delivery_fee_bani: 0,
            });
            setOpen(true);
          }}
        >
          Adaugă zonă
        </button>
      </div>
      <Alert error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zonă</th>
              <th>Sector părinte</th>
              <th>Minim</th>
              <th>Livrare</th>
              <th>Stare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>
                  {z.city} · {z.name}
                </td>
                <td>
                  {zones.find((x) => x.id === z.parent_zone_id)?.name || "—"}
                </td>
                <td>{money(z.minimum_basket_bani)}</td>
                <td>{money(z.delivery_fee_bani)}</td>
                <td>{z.active ? "Activă" : "Inactivă"}</td>
                <td>
                  <button className="table-link" onClick={() => edit(z)}>
                    Editează
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <section className="detail-panel">
          <h2>{editing ? "Editează zona" : "Zonă nouă"}</h2>
          <form className="form-stack" onSubmit={save}>
            <div className="form-grid">
              <label>
                Oraș
                <input
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                Nume
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Sector părinte
                <select
                  value={form.parent_zone_id}
                  onChange={(e) =>
                    setForm({ ...form, parent_zone_id: e.target.value })
                  }
                >
                  <option value="">Fără părinte</option>
                  {zones
                    .filter((z) => !z.parent_zone_id && z.id !== editing)
                    .map((z) => (
                      <option value={z.id} key={z.id}>
                        {z.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Minim coș (bani)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimum_basket_bani}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      minimum_basket_bani: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Taxă livrare (bani)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.delivery_fee_bani}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      delivery_fee_bani: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{" "}
              Zonă activă
            </label>
            <div className="actions">
              <button>Salvează</button>
              <button
                type="button"
                className="button-outline"
                onClick={() => setOpen(false)}
              >
                Anulează
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
function localInput(iso: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}
function toUTC(local: string) {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const target = Date.UTC(y, m - 1, d, h, min);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const formatted = localInput(new Date(candidate).toISOString());
    const [fd, ft] = formatted.split("T");
    const [fy, fm, fday] = fd.split("-").map(Number);
    const [fh, fmin] = ft.split(":").map(Number);
    candidate += target - Date.UTC(fy, fm - 1, fday, fh, fmin);
  }
  if (localInput(new Date(candidate).toISOString()) !== local)
    throw Error("Ora selectată nu există în fusul orar Chișinău.");
  return new Date(candidate).toISOString();
}
function Windows({ token }: { token: string }) {
  const [items, setItems] = useState<Window[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Window | null>(null);
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState("");
  const [delivery, setDelivery] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [capacity, setCapacity] = useState("");
  const [active, setActive] = useState(true);
  const load = useCallback(async () => {
    try {
      const [w, z] = await Promise.all([
        api.adminGet<Window[]>("/delivery-windows", token),
        api.adminGet<Zone[]>("/delivery-zones", token),
      ]);
      setItems(w);
      setZones(z);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  function edit(w: Window) {
    setEditing(w);
    setZone(String(w.zone_id));
    setDelivery(localInput(w.delivery_at));
    setCutoff(localInput(w.ordering_cutoff));
    setCapacity(w.capacity == null ? "" : String(w.capacity));
    setActive(Boolean(w.active));
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data: {
        active: boolean;
        capacity: number | null;
        delivery_at?: string;
        ordering_cutoff?: string;
        zone_id?: number;
      } = { active, capacity: capacity ? Number(capacity) : null };
      if (!editing || !editing.reserved_orders) {
        data.delivery_at = toUTC(delivery);
        data.ordering_cutoff = toUTC(cutoff);
      }
      if (!editing) data.zone_id = Number(zone);
      if (editing)
        await api.adminPatch(`/delivery-windows/${editing.id}`, data, token);
      else await api.adminPost("/delivery-windows", data, token);
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Intervale programate</h2>
          <p>Orele sunt afișate în fusul orar Chișinău.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setZone("");
            setDelivery("");
            setCutoff("");
            setCapacity("");
            setActive(true);
            setOpen(true);
          }}
        >
          Adaugă interval
        </button>
      </div>
      <Alert error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zonă</th>
              <th>Livrare</th>
              <th>Termen limită</th>
              <th>Rezervări / capacitate</th>
              <th>Stare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
                <td>
                  {zones.find((z) => z.id === w.zone_id)?.name || w.zone_id}{" "}
                  {w.is_demo && "· SIMULAT"}
                </td>
                <td>{dateTime(w.delivery_at)}</td>
                <td>{dateTime(w.ordering_cutoff)}</td>
                <td>
                  {w.reserved_orders} / {w.capacity ?? "nelimitat"}
                </td>
                <td>{w.active ? "Activ" : "Inactiv"}</td>
                <td>
                  <button className="table-link" onClick={() => edit(w)}>
                    Editează
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <section className="detail-panel">
          <h2>{editing ? "Editează intervalul" : "Interval nou"}</h2>
          <form className="form-stack" onSubmit={save}>
            <label>
              Zonă
              <select
                required
                disabled={!!editing}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="">Alege zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Livrare (Chișinău)
                <input
                  type="datetime-local"
                  required
                  disabled={Boolean(editing?.reserved_orders)}
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                />
              </label>
              <label>
                Termen limită (Chișinău)
                <input
                  type="datetime-local"
                  required
                  disabled={Boolean(editing?.reserved_orders)}
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                />
              </label>
            </div>
            {Boolean(editing?.reserved_orders) && (
              <p className="hint">
                Orele nu pot fi schimbate după rezervarea comenzilor.
              </p>
            )}
            <label>
              Capacitate (gol = nelimitat)
              <input
                type="number"
                min={Math.max(1, editing?.reserved_orders || 0)}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{" "}
              Activ
            </label>
            <div className="actions">
              <button>Salvează</button>
              <button
                type="button"
                className="button-outline"
                onClick={() => setOpen(false)}
              >
                Anulează
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
function MapPage({ token }: { token: string }) {
  const [data, setData] = useState<MapData>({ markers: [], unlocated: [] });
  const [error, setError] = useState("");
  const [demo, setDemo] = useState("false");
  const [zone, setZone] = useState("");
  const [date, setDate] = useState("");
  const [windowId, setWindowId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<MapOrder | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [note, setNote] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedId = useRef<number | null>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const load = useCallback(async () => {
    const q = new URLSearchParams({ is_demo: demo });
    if (zone) q.set("zone_id", zone);
    if (date) q.set("date", date);
    if (windowId) q.set("window_id", windowId);
    if (batchId) q.set("batch_id", batchId);
    if (status) q.set("status", status);
    try {
      setData(await api.adminGet<MapData>(`/orders/map?${q}`, token));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, demo, zone, date, windowId, batchId, status]);
  useEffect(() => {
    void load();
  }, [load]);
  const selectOrder = useCallback(
    async (order: MapOrder) => {
      selectedId.current = order.id;
      setSelected(order);
      setOrderDetail(null);
      setNote(order.location_review_note || "");
      setLatitude(order.latitude == null ? "" : String(order.latitude));
      setLongitude(order.longitude == null ? "" : String(order.longitude));
      setError("");
      try {
        const detail = await api.adminGet<OrderDetail>(
          `/orders/${order.id}`,
          token,
        );
        if (selectedId.current === order.id) setOrderDetail(detail);
      } catch (e) {
        if (selectedId.current === order.id) setError((e as Error).message);
      }
    },
    [token],
  );
  useEffect(() => {
    if (!mapNode.current) return;
    const map = L.map(mapNode.current).setView([47.025, 28.835], 11);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    markers.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markers.current = null;
    };
  }, []);
  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    data.markers.forEach((o) => {
      if (o.latitude == null || o.longitude == null) return;
      const marker = L.circleMarker([o.latitude, o.longitude], {
        radius: 8,
        color: "#174c3d",
        fillColor: o.is_demo ? "#df9758" : "#318468",
        fillOpacity: 0.85,
      }).addTo(layer);
      marker.bindTooltip(`Comanda #${o.id}`);
      marker.on("click", () => {
        void selectOrder(o);
      });
    });
  }, [data, selectOrder]);
  async function saveCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      setError("Introdu ambele coordonate în limitele geografice valide.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.adminPatch<MapOrder>(
        `/orders/${selected.id}/location`,
        { latitude: lat, longitude: lon, location_review_note: note || null },
        token,
      );
      setSelected(updated);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function review(status: string) {
    if (!selected) return;
    try {
      await api.adminPatch(
        `/orders/${selected.id}/location`,
        {
          location_verification_status: status,
          location_review_note: note || null,
        },
        token,
      );
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h2>Locații de livrare</h2>
          <p>
            Coordonatele nu sunt verificate automat; harta nu calculează rute.
          </p>
        </div>
      </div>
      <div className="filters">
        <label>
          Tip
          <select value={demo} onChange={(e) => setDemo(e.target.value)}>
            <option value="false">Reale</option>
            <option value="true">Simulate</option>
          </select>
        </label>
        <label>
          ID zonă
          <input
            type="number"
            min="1"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
        </label>
        <label>
          Data livrării (UTC)
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          ID interval
          <input
            type="number"
            min="1"
            value={windowId}
            onChange={(e) => setWindowId(e.target.value)}
          />
        </label>
        <label>
          ID lot
          <input
            type="number"
            min="1"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          />
        </label>
        <label>
          Stare
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Toate</option>
            <option value="requested">Solicitată</option>
            <option value="confirmed">Confirmată</option>
            <option value="packed">Ambalată</option>
            <option value="dispatched">Expediată</option>
            <option value="delivered">Livrată</option>
          </select>
        </label>
      </div>
      <Alert error={error} />
      <div ref={mapNode} className="map" aria-label="Harta comenzilor" />
      <p className="hint">
        Selectează un marcaj pentru verificare manuală. Fundalul hărții necesită
        conexiune la internet.
      </p>
      {selected && (
        <section className="detail-panel">
          <div className="section-heading">
            <h2>Comanda #{selected.id}</h2>
            <button
              className="text-button"
              onClick={() => {
                selectedId.current = null;
                setSelected(null);
              }}
            >
              Închide
            </button>
          </div>
          <p>
            {selected.address} · {selected.location_verification_status} ·{" "}
            {money(selected.total_bani)}
          </p>
          {orderDetail?.id === selected.id && (
            <p>
              {orderDetail.customer_name} · {orderDetail.phone} ·{" "}
              {orderDetail.items
                .map(
                  (item) =>
                    `${item.quantity} × ${item.product_name || `#${item.product_id}`}`,
                )
                .join(", ")}
            </p>
          )}
          <label>
            Notă de verificare
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <form className="form-stack" onSubmit={saveCoordinates}>
            <div className="form-grid">
              <label>
                Latitudine
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </label>
              <label>
                Longitudine
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              Salvarea coordonatelor marchează locația ca neverificată.
            </p>
            <button disabled={saving}>Salvează coordonatele</button>
          </form>
          <div className="actions">
            <button
              disabled={selected.latitude == null}
              onClick={() => void review("verified")}
            >
              Marchează verificat manual
            </button>
            <button
              className="button-outline"
              disabled={selected.latitude == null}
              onClick={() => void review("flagged")}
            >
              Necesită verificare
            </button>
          </div>
        </section>
      )}
      <section className="admin-section">
        <h2>Fără coordonate ({data.unlocated.length})</h2>
        {data.unlocated.length ? (
          data.unlocated.map((o) => (
            <p key={o.id}>
              <button
                className="table-link"
                onClick={() => void selectOrder(o)}
              >
                Comanda #{o.id}
              </button>{" "}
              · {o.address} · {money(o.total_bani)}
            </p>
          ))
        ) : (
          <p>Nu există comenzi fără coordonate în selecția curentă.</p>
        )}
      </section>
    </>
  );
}
