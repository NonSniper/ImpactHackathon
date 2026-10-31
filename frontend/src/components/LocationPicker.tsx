import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function LocationPicker({ address, onAddress }: { address: string; onAddress: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState("");
  const [results, setResults] = useState<{ formatted: string; lat: number; lon: number }[]>([]);
  const [confirmedAddress, setConfirmedAddress] = useState("");
  const geoKey = import.meta.env.VITE_GEOAPIFY_KEY;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  useEffect(() => {
    if (!visible || !container.current) return;
    const instance = L.map(container.current).setView([47.025, 28.835], 11);
    map.current = instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(instance);
    instance.on("click", (e) => {
      setLatitude(e.latlng.lat.toFixed(6));
      setLongitude(e.latlng.lng.toFixed(6));
    });
    return () => {
      instance.remove();
      map.current = null;
      pin.current = null;
    };
  }, [visible]);
  useEffect(() => {
    if (!map.current) return;
    if (pin.current) {
      pin.current.remove();
      pin.current = null;
    }
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      latitude &&
      longitude &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      pin.current = L.circleMarker([lat, lon], {
        radius: 9,
        color: "#174c3d",
        fillOpacity: 0.8,
      }).addTo(map.current);
      map.current.setView([lat, lon], Math.max(map.current.getZoom(), 15));
    }
  }, [latitude, longitude, visible]);
  useEffect(() => {
    if (!geoKey || address.trim().length < 4 || address === confirmedAddress) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ text: address, filter: "countrycode:md", format: "json", limit: "5", apiKey: geoKey });
      fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: controller.signal })
        .then(r => { if (!r.ok) throw Error("lookup failed"); return r.json(); })
        .then(data => { setResults(data.results || []); setLocationError(""); })
        .catch(e => { if (e.name !== "AbortError") { setResults([]); setLocationError("Căutarea adresei nu este disponibilă; poți folosi harta."); } });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [address, confirmedAddress, geoKey]);
  useEffect(() => {
    if (confirmedAddress && address !== confirmedAddress) { setLatitude(""); setLongitude(""); setConfirmedAddress(""); }
  }, [address, confirmedAddress]);
  return (
    <details>
      <summary>Adaugă locația pe hartă (opțional)</summary>
      <p className="hint">
        Alege un punct pe hartă sau introdu coordonatele. Locația rămâne
        neverificată.
      </p>
      {geoKey && <p className="hint">Adresa introdusă este trimisă către Geoapify pentru sugestii.</p>}
      {geoKey && results.length > 0 && <div><p>Sugestii pentru adresa introdusă:</p>{results.map((result, i) => <button type="button" className="text-button" key={i} onClick={() => { setConfirmedAddress(result.formatted); onAddress(result.formatted); setLatitude(String(result.lat)); setLongitude(String(result.lon)); setResults([]); setVisible(true); }}>{result.formatted}</button>)}<small>Adresă: <a href="https://www.geoapify.com/">Geoapify</a></small></div>}
      <button type="button" className="button-outline" onClick={() => {
        if (!navigator.geolocation) { setLocationError("Locația dispozitivului nu este disponibilă."); return; }
        navigator.geolocation.getCurrentPosition(position => { setLatitude(String(position.coords.latitude)); setLongitude(String(position.coords.longitude)); setVisible(true); setLocationError(""); }, () => setLocationError("Nu am putut obține locația. Poți alege un punct manual."));
      }}>Folosește locația mea</button>
      {locationError && <p className="error" role="status">{locationError}</p>}
      <button
        type="button"
        className="button-outline"
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Ascunde harta" : "Alege pe hartă"}
      </button>
      {visible && (
        <div
          className="map picker-map"
          ref={container}
          aria-label="Alege locația de livrare pe hartă"
        />
      )}
      <div className="form-grid">
        <label>
          Latitudine
          <input
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </label>
        <label>
          Longitudine
          <input
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </label>
      </div>
    </details>
  );
}
