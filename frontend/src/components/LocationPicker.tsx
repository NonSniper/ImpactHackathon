import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function LocationPicker() {
  const [visible, setVisible] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
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
    )
      pin.current = L.circleMarker([lat, lon], {
        radius: 9,
        color: "#174c3d",
        fillOpacity: 0.8,
      }).addTo(map.current);
  }, [latitude, longitude, visible]);
  return (
    <details>
      <summary>Adaugă locația pe hartă (opțional)</summary>
      <p className="hint">
        Alege un punct pe hartă sau introdu coordonatele. Locația rămâne
        neverificată.
      </p>
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
