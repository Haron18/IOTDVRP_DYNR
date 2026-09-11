import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Streamlit, withStreamlitConnection } from "streamlit-component-lib";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PRIORITY_COLOR = { URGENTE: "red", HAUTE: "orange", NORMALE: "blue" };

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function interpolate(shape, cumKm, targetKm) {
  if (!shape || shape.length === 0) return null;
  if (targetKm <= 0) return shape[0];
  const total = cumKm[cumKm.length - 1];
  if (targetKm >= total) return shape[shape.length - 1];
  for (let i = 1; i < cumKm.length; i++) {
    if (cumKm[i] >= targetKm) {
      const segLen = cumKm[i] - cumKm[i - 1];
      const ratio = segLen === 0 ? 0 : (targetKm - cumKm[i - 1]) / segLen;
      return [
        shape[i - 1][0] + (shape[i][0] - shape[i - 1][0]) * ratio,
        shape[i - 1][1] + (shape[i][1] - shape[i - 1][1]) * ratio,
      ];
    }
  }
  return shape[shape.length - 1];
}

/**
 * Composant Streamlit personnalisé (React) : carte des tournées DVRP avec animation
 * fluide des camions côté navigateur (requestAnimationFrame), sans dépendre du rythme
 * des rerun Streamlit. Reçoit ses données via `args` (protocole Streamlit standard) :
 *   - depot: [lat, lon]
 *   - orders: [{lat, lon, id, client, demand_kg, temp_max, time_window, priority}, ...]
 *   - trucks: [{label, color, used, shape, trip_shapes, total_km, traveled_km,
 *               speed_kmh, animate, sim_minutes_per_real_second, status_label}, ...]
 *   - height: hauteur en px
 */
function DvrpMap({ args }) {
  const { depot, orders = [], trucks = [], height = 520 } = args;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // État d'animation persistant par camion (marker Leaflet + paramètres de vitesse),
  // conservé entre deux ticks pour ne JAMAIS reconstruire la carte inutilement.
  const truckStateRef = useRef({});

  useEffect(() => {
    Streamlit.setFrameHeight(height + 10);
  }, [height]);

  // Clé "structurelle" : ne change que si les tracés/itinéraires changent réellement
  // (nouveau calcul OR-Tools après un événement) — PAS à chaque tick, où seul
  // `traveled_km` avance. Sert à déclencher la (re)construction de la carte
  // UNIQUEMENT quand c'est nécessaire, pour éviter tout flash/saccade au fil de
  // l'auto-refresh, même avec un intervalle de rafraîchissement serveur long.
  const structuralKey = JSON.stringify({
    depot,
    orders: orders.map((o) => [o.lat, o.lon, o.priority]),
    trucks: trucks.map((t) => ({
      label: t.label,
      color: t.color,
      used: t.used,
      shape: t.shape,
      trip_shapes: t.trip_shapes,
    })),
  });

  // (Re)construction complète de la carte — seulement quand structuralKey change.
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (!containerRef.current) return undefined;

    const map = L.map(containerRef.current).setView(depot, 11);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    L.marker(depot, {
      icon: L.divIcon({ className: "depot-icon", html: "🏠", iconSize: [24, 24] }),
    })
      .addTo(map)
      .bindPopup("<b>Dépôt Central — Oued Smar</b>");

    orders.forEach((o) => {
      const color = PRIORITY_COLOR[o.priority] || "blue";
      L.circleMarker([o.lat, o.lon], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `<b>${o.client}</b><br>Charge: ${o.demand_kg} kg<br>` +
            `Temp. max: ${o.temp_max}°C<br>Fenêtre: ${o.time_window}`
        )
        .bindTooltip(o.id);
    });

    const newState = {};
    trucks.forEach((t) => {
      const shape = t.shape || [];
      const cumKm = [0];
      for (let i = 1; i < shape.length; i++) {
        cumKm.push(
          cumKm[cumKm.length - 1] +
            haversineKm(shape[i - 1][0], shape[i - 1][1], shape[i][0], shape[i][1])
        );
      }
      if (t.used && shape.length && t.trip_shapes) {
        t.trip_shapes.forEach((path) => {
          L.polyline(path, { color: t.color, weight: 4, opacity: 0.85 }).addTo(map);
        });
      }
      const startPos =
        t.used && shape.length ? interpolate(shape, cumKm, t.traveled_km) : depot;
      const marker = L.marker(startPos, {
        icon: L.divIcon({ className: "truck-icon", html: "🚚", iconSize: [24, 24] }),
      })
        .addTo(map)
        .bindTooltip(`${t.label} — ${t.status_label || ""}`);

      newState[t.label] = {
        marker,
        shape,
        cumKm,
        used: t.used,
        totalKm: t.total_km,
        speedKmh: t.speed_kmh,
        animate: t.animate,
        simMinPerRealSec: t.sim_minutes_per_real_second,
        baseTraveledKm: t.traveled_km,
        baseTime: performance.now(),
      };
    });
    truckStateRef.current = newState;

    let frameId;
    function animate(now) {
      Object.values(truckStateRef.current).forEach((s) => {
        if (s.used && s.animate && s.shape.length) {
          const elapsedSec = (now - s.baseTime) / 1000;
          const simMinutesElapsed = elapsedSec * (s.simMinPerRealSec || 0);
          const traveledKm = Math.min(
            s.totalKm,
            s.baseTraveledKm + s.speedKmh * (simMinutesElapsed / 60)
          );
          const pos = interpolate(s.shape, s.cumKm, traveledKm);
          if (pos) s.marker.setLatLng(pos);
        }
      });
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);

    Streamlit.setComponentValue({ ready: true });

    return () => {
      cancelAnimationFrame(frameId);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  // Mise à jour "douce" à chaque nouveau tick (traveled_km avance côté serveur) : on ne
  // touche NI à la carte NI aux polylines NI au zoom — on recale juste la base de calcul
  // de l'animation pour chaque camion déjà présent, sans aucune coupure visuelle.
  const dynamicKey = JSON.stringify(
    trucks.map((t) => [t.label, t.traveled_km, t.animate, t.speed_kmh, t.sim_minutes_per_real_second, t.status_label])
  );
  useEffect(() => {
    trucks.forEach((t) => {
      const s = truckStateRef.current[t.label];
      if (!s) return;
      s.animate = t.animate;
      s.speedKmh = t.speed_kmh;
      s.simMinPerRealSec = t.sim_minutes_per_real_second;
      s.totalKm = t.total_km;
      s.baseTraveledKm = t.traveled_km;
      s.baseTime = performance.now();
      if (s.marker) s.marker.setTooltipContent(`${t.label} — ${t.status_label || ""}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicKey]);

  return (
    <div>
      <style>{`
        .truck-icon { font-size: 22px; line-height: 22px; text-align: center;
                      filter: drop-shadow(0 0 2px rgba(0,0,0,.6)); }
        .depot-icon { font-size: 22px; line-height: 22px; text-align: center; }
      `}</style>
      <div ref={containerRef} style={{ width: "100%", height: `${height}px`, borderRadius: 8 }} />
    </div>
  );
}

const ConnectedDvrpMap = withStreamlitConnection(DvrpMap);
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<ConnectedDvrpMap />);
