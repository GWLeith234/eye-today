"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import L from "leaflet";
import "leaflet.markercluster";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

export type MapPin = { slug: string; name: string; lat: number; lng: number };

// The default pin, from the leaflet package itself (bundled by Next, not fetched from a CDN).
const icon = L.icon({
  iconUrl: markerIcon.src,
  iconRetinaUrl: marker2x.src,
  shadowUrl: markerShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function Pins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup();
    for (const pin of pins) {
      if (!SLUG.test(pin.slug)) continue;
      const marker = L.marker([pin.lat, pin.lng], { icon, title: pin.name, alt: pin.name });
      // Built from DOM nodes, never HTML, so a listing name cannot inject markup.
      const link = document.createElement("a");
      link.href = `/directory/listing/${pin.slug}`;
      link.textContent = pin.name;
      marker.bindPopup(link);
      group.addLayer(marker);
    }
    map.addLayer(group);
    if (pins.length > 0) map.fitBounds(group.getBounds(), { padding: [32, 32], maxZoom: 12 });
    return () => {
      map.removeLayer(group);
    };
  }, [map, pins]);
  return null;
}

export default function DirectoryMapInner({ pins }: { pins: MapPin[] }) {
  return (
    <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom={false} className="h-[420px] w-full" data-testid="directory-map">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <Pins pins={pins} />
    </MapContainer>
  );
}
