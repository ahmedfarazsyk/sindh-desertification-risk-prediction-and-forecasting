'use client'

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMapEvents, Polygon, Polyline, CircleMarker, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export interface SelectionInfo {
  coords: number[][][];
  areaSqKm: number;
  corners: { lat: number; lng: number }[] | { lat: number; lng: number }[][];
}

interface MapWidgetProps {
  onSelectionChange: (info: SelectionInfo | null) => void;
  selectionMode: 'square' | 'freeform';
  historySelection?: SelectionInfo | null;
}

// --------------------------------------------------------------------------
// Interaction Handler: Manages clicks, drags, and history panning
// --------------------------------------------------------------------------
function MapInteractionHandler({
  selectionMode,
  corner1, corner2,
  freeformPoints, isFreeformClosed,
  clearSelection,
  setCorner1, setCorner2, setMousePos, setFreeformPoints, setIsFreeformClosed,
  historySelection
}: any) {

  const map = useMapEvents({
    click(e) {
      if (selectionMode === 'square') {
        if (!corner1 || (corner1 && corner2)) {
          clearSelection();
          setCorner1(e.latlng);
          setCorner2(null);
          setMousePos(e.latlng);
        } else {
          setCorner2(e.latlng);
          setMousePos(null);
        }
      } else if (selectionMode === 'freeform') {
        if (isFreeformClosed) {
          clearSelection();
          setFreeformPoints([e.latlng]);
          setMousePos(e.latlng);
        } else {
          if (freeformPoints.length >= 3) {
            const firstPtScreen = map.latLngToContainerPoint(freeformPoints[0]);
            const clickPtScreen = e.containerPoint;
            
            if (firstPtScreen.distanceTo(clickPtScreen) < 25) { 
              setIsFreeformClosed(true);
              setMousePos(null);
              return; 
            }
          }
          setFreeformPoints((prev: any[]) => [...prev, e.latlng]);
        }
      }
    },
    mousemove(e) {
      if (selectionMode === 'square' && corner1 && !corner2) {
        setMousePos(e.latlng);
      } else if (selectionMode === 'freeform' && freeformPoints.length > 0 && !isFreeformClosed) {
        setMousePos(e.latlng);
      }
    },
  });

  // Handle History loads -> Safely map single or multi-polygons and calculate bounds
  useEffect(() => {
    if (historySelection && historySelection.corners && historySelection.corners.length > 0) {
      
      const isMultiPolygon = Array.isArray(historySelection.corners[0]);
      let pts: any;
      let flatPts: any[] = [];

      if (isMultiPolygon) {
        // Map 2D array of boundaries (e.g. multiple islands/enclaves)
        pts = historySelection.corners.map((path: any[]) => path.map(c => L.latLng(c.lat, c.lng)));
        flatPts = pts.flat(); // Flatten 1 level for the bounds calculator
      } else {
        // Map standard 1D array boundary
        pts = historySelection.corners.map((c: any) => L.latLng(c.lat, c.lng));
        flatPts = pts;
      }

      setFreeformPoints(pts);
      setIsFreeformClosed(true);
      
      setCorner1(null);
      setCorner2(null);
      setMousePos(null);

      // Robust Bounding Box Panning
      try {
        const validPts = flatPts.filter((p: any) => p && typeof p.lat === 'number' && typeof p.lng === 'number');
        if (validPts.length > 0) {
          const bounds = L.latLngBounds(validPts);
          if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
          }
        }
      } catch (e) {
        console.error("Map pan error:", e);
      }
    }
  }, [historySelection, map, setCorner1, setCorner2, setMousePos, setFreeformPoints, setIsFreeformClosed]);

  return null;
}

// --------------------------------------------------------------------------
// MAIN MAP COMPONENT
// --------------------------------------------------------------------------
export default function MapWidget({ onSelectionChange, selectionMode, historySelection }: MapWidgetProps) {
  const [mousePos, setMousePos] = useState<L.LatLng | null>(null);

  const [corner1, setCorner1] = useState<L.LatLng | null>(null);
  const [corner2, setCorner2] = useState<L.LatLng | null>(null);

  // Set as any[] to safely hold both LatLng[] (User Drawing) and LatLng[][] (MultiPolygons from DB)
  const [freeformPoints, setFreeformPoints] = useState<any[]>([]);
  const [isFreeformClosed, setIsFreeformClosed] = useState(false);

  const clearSelection = () => {
    setCorner1(null);
    setCorner2(null);
    setMousePos(null);
    setFreeformPoints([]);
    setIsFreeformClosed(false);
    onSelectionChange(null);
  };

  // Run selection data export when user finishes drawing manually
  useEffect(() => {
    if (selectionMode === 'square') {
      if (!corner1 || !corner2) {
        onSelectionChange(null);
        return;
      }

      const widthMeters = corner1.distanceTo(L.latLng(corner1.lat, corner2.lng));
      const heightMeters = corner1.distanceTo(L.latLng(corner2.lat, corner1.lng));
      const areaSqKm = (widthMeters * heightMeters) / 1000000;

      const corners = [
        { lat: corner1.lat, lng: corner1.lng },
        { lat: corner1.lat, lng: corner2.lng },
        { lat: corner2.lat, lng: corner2.lng },
        { lat: corner2.lat, lng: corner1.lng },
      ];

      const coords = [[
        [corners[0].lng, corners[0].lat],
        [corners[1].lng, corners[1].lat],
        [corners[2].lng, corners[2].lat],
        [corners[3].lng, corners[3].lat],
        [corners[0].lng, corners[0].lat], 
      ]];

      onSelectionChange({ coords, areaSqKm, corners });

    } else if (selectionMode === 'freeform') {
      if (!isFreeformClosed || freeformPoints.length < 3) {
        onSelectionChange(null);
        return;
      }

      // Do NOT recalculate or re-trigger if this is a MultiPolygon loaded from History 
      // (The DB already provided the exact area and nested coordinates).
      if (Array.isArray(freeformPoints[0])) return;
      if (historySelection && freeformPoints.length === historySelection.corners.length) return;

      let area = 0;
      const radius = 6378137; 
      for (let i = 0; i < freeformPoints.length; i++) {
        const p1 = freeformPoints[i];
        const p2 = freeformPoints[(i + 1) % freeformPoints.length];
        area += (p2.lng - p1.lng) * Math.PI / 180 *
                (Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180)) / 2;
      }
      const areaSqKm = Math.abs(area * radius * radius) / 1000000;

      const corners = freeformPoints.map(p => ({ lat: p.lat, lng: p.lng }));
      const coords = [[
        ...freeformPoints.map(p => [p.lng, p.lat]),
        [freeformPoints[0].lng, freeformPoints[0].lat] 
      ]];

      onSelectionChange({ coords, areaSqKm, corners });
    }
  }, [corner1, corner2, isFreeformClosed, freeformPoints, selectionMode]);

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer 
        center={[25.3960, 68.3578]} 
        zoom={10} 
        scrollWheelZoom={true} 
        doubleClickZoom={false} 
        className="h-full w-full cursor-crosshair"
        zoomControl={false}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Street Map (OSM)">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (Esri)">
            <TileLayer attribution='&copy; <a href="https://www.esri.com/">Esri</a>' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Light Map (CartoDB)">
            <TileLayer attribution='&copy; <a href="https://carto.com/">CartoDB</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapInteractionHandler 
          selectionMode={selectionMode}
          corner1={corner1}
          corner2={corner2}
          freeformPoints={freeformPoints}
          isFreeformClosed={isFreeformClosed}
          clearSelection={clearSelection}
          setCorner1={setCorner1}
          setCorner2={setCorner2}
          setMousePos={setMousePos}
          setFreeformPoints={setFreeformPoints}
          setIsFreeformClosed={setIsFreeformClosed}
          historySelection={historySelection}
        />
        
        {/* SQUARE MODE RENDERING */}
        {selectionMode === 'square' && (
          <>
            {corner1 && !corner2 && mousePos && (
              <Polygon 
                positions={[
                  [corner1.lat, corner1.lng],
                  [corner1.lat, mousePos.lng],
                  [mousePos.lat, mousePos.lng],
                  [mousePos.lat, corner1.lng],
                ]} 
                pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2, dashArray: '4' }} 
              />
            )}
            {corner1 && corner2 && (
              <Polygon 
                positions={[
                  [corner1.lat, corner1.lng],
                  [corner1.lat, corner2.lng],
                  [corner2.lat, corner2.lng],
                  [corner2.lat, corner1.lng],
                ]} 
                pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }} 
              />
            )}
            {corner1 && <CircleMarker center={[corner1.lat, corner1.lng]} radius={4} interactive={false} pathOptions={{ color: 'white', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />}
            {corner1 && corner2 && (
              <>
                <CircleMarker center={[corner1.lat, corner2.lng]} radius={4} interactive={false} pathOptions={{ color: 'white', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />
                <CircleMarker center={[corner2.lat, corner2.lng]} radius={4} interactive={false} pathOptions={{ color: 'white', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />
                <CircleMarker center={[corner2.lat, corner1.lng]} radius={4} interactive={false} pathOptions={{ color: 'white', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />
              </>
            )}
          </>
        )}

        {/* FREEFORM / HISTORY MODE RENDERING */}
        {(selectionMode === 'freeform' || isFreeformClosed) && (
          <>
            {/* Draw active dotted line ONLY if user is actively drawing a 1D Polygon */}
            {freeformPoints.length > 0 && !isFreeformClosed && mousePos && !Array.isArray(freeformPoints[0]) && (
              <Polyline 
                positions={[...freeformPoints, mousePos]} 
                pathOptions={{ color: '#2563eb', weight: 2, dashArray: '4' }} 
              />
            )}
            
            {/* Native Leaflet Polygon natively supports mapping 2D MultiPolygons out of the box! */}
            {isFreeformClosed && freeformPoints.length > 0 && (
              <Polygon 
                positions={freeformPoints} 
                pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }} 
              />
            )}

            {/* Render markers by safely flattening the boundaries regardless of nesting depth */}
            {(Array.isArray(freeformPoints[0]) ? freeformPoints.flat() : freeformPoints).map((pt: any, idx: number) => {
              const isFirst = idx === 0;
              const isDrawing = !Array.isArray(freeformPoints[0]);
              const canClose = isFirst && isDrawing && freeformPoints.length >= 3 && !isFreeformClosed;
              
              return (
                <CircleMarker 
                  key={idx}
                  center={pt} 
                  radius={canClose ? 9 : 4} 
                  interactive={false}
                  pathOptions={{ 
                    color: 'white', 
                    weight: 2, 
                    fillColor: canClose ? '#10b981' : '#2563eb', 
                    fillOpacity: 1 
                  }} 
                />
              );
            })}
          </>
        )}
      </MapContainer>
      
      <button 
        onClick={clearSelection}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl hover:bg-gray-50 text-slate-800 font-bold transition-all border border-gray-200 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        Clear Selection
      </button>
    </div>
  );
}
