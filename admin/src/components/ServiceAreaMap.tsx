import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import postalData from "@/data/postal-coordinates.json";
import { postalCodesWithinRadius } from "@/lib/postal-distances";

interface PostalEntry { code: string; lat: number; lng: number; place?: string }

const coordMap = new Map<string, PostalEntry>();
for (const e of postalData as PostalEntry[]) {
  coordMap.set(e.code, e);
}

function FitBounds({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    const radiusMeters = Math.max(radiusKm, 1) * 1000;
    const bounds = L.latLng(lat, lng).toBounds(radiusMeters * 2);
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [lat, lng, radiusKm, map]);
  return null;
}

interface Props {
  centerPostal: string;
  radiusKm: number;
  height?: number;
}

export default function ServiceAreaMap({ centerPostal, radiusKm, height = 320 }: Props) {
  const center = coordMap.get(centerPostal);
  const [hovered, setHovered] = useState<PostalEntry | null>(null);

  const codes = useMemo(() => {
    if (!center || !radiusKm || radiusKm <= 0) return [];
    return postalCodesWithinRadius(centerPostal, radiusKm);
  }, [centerPostal, radiusKm, center]);

  if (!center) {
    return (
      <div
        style={{ height }}
        className="rounded-xl border border-border bg-surface-alt flex items-center justify-center text-sm text-text-muted"
      >
        Anna voimassa oleva postinumero nähdäksesi kartan
      </div>
    );
  }

  const centerLatLng: L.LatLngTuple = [center.lat, center.lng];
  const radiusMeters = Math.max(radiusKm || 1, 1) * 1000;

  return (
    <div
      style={{ height }}
      className="rounded-xl overflow-hidden border border-border relative"
    >
      <MapContainer
        center={centerLatLng}
        zoom={9}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Circle
          center={centerLatLng}
          radius={radiusMeters}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.12,
            weight: 2,
          }}
        />

        {codes.map((code) => {
          if (code === centerPostal) return null;
          const c = coordMap.get(code);
          if (!c) return null;
          return (
            <CircleMarker
              key={code}
              center={[c.lat, c.lng]}
              radius={3}
              pathOptions={{
                color: "#1d4ed8",
                fillColor: "#3b82f6",
                fillOpacity: 0.7,
                weight: 1,
              }}
              eventHandlers={{
                mouseover: () => setHovered(c),
                mouseout: () => setHovered((cur) => (cur?.code === c.code ? null : cur)),
              }}
            />
          );
        })}

        <CircleMarker
          center={centerLatLng}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#dc2626",
            fillOpacity: 1,
            weight: 2,
          }}
        />

        <FitBounds lat={center.lat} lng={center.lng} radiusKm={radiusKm || 1} />
      </MapContainer>

      <div className="absolute top-2 left-2 z-[400] bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 text-xs shadow-sm border border-border pointer-events-none">
        <div className="font-mono font-semibold text-red-600">{centerPostal}{center.place ? ` · ${center.place}` : ""}</div>
        <div className="text-text-muted mt-0.5">Keskipiste</div>
      </div>

      {hovered && (
        <div className="absolute top-2 right-2 z-[400] bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 text-xs shadow-sm border border-border pointer-events-none">
          <div className="font-mono font-semibold text-text-primary">{hovered.code}{hovered.place ? ` · ${hovered.place}` : ""}</div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-[400] bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 text-xs font-medium text-text-primary shadow-sm border border-border pointer-events-none">
        {codes.length} postinumeroa · {radiusKm} km
      </div>
    </div>
  );
}
