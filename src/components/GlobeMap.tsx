import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { RadioStation } from "../types/radio";

const sourceId = "radio-stations";
const layerId = "radio-station-points";

interface Props {
  accessToken?: string;
  stations: RadioStation[];
  playingId: string | null;
  onSelect: (station: RadioStation) => void;
}

export function GlobeMap({ accessToken, stations, playingId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState("");
  const [hasRendered, setHasRendered] = useState(false);
  const token = accessToken?.trim();
  const validToken = Boolean(token && /^pk\.[\w-]+\.[\w-]+$/.test(token));

  const data = useMemo<FeatureCollection<Point, { stationuuid: string }>>(() => ({
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      properties: { stationuuid: station.stationuuid },
      geometry: { type: "Point", coordinates: [station.geo_long, station.geo_lat] },
    })),
  }), [stations]);
  const byId = useMemo(() => new Map(stations.map((station) => [station.stationuuid, station])), [stations]);
  const latest = useRef({ data, byId, playingId, onSelect });

  useLayoutEffect(() => {
    latest.current = { data, byId, playingId, onSelect };
  }, [data, byId, playingId, onSelect]);

  useEffect(() => {
    if (!validToken || !token || !container.current) return;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        accessToken: token,
        container: container.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: [126.9780, 37.5665],
        zoom: 2.2,
      });
    } catch {
      const report = window.setTimeout(() => {
        setError("지구본을 시작할 수 없습니다. 브라우저의 WebGL 설정을 확인하세요.");
      }, 0);
      return () => window.clearTimeout(report);
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    let rendered = false;
    const loadTimeout = window.setTimeout(() => {
      setError((previous) => previous || "지도 로딩 시간이 초과되었습니다. 네트워크 연결을 확인한 뒤 새로고침하세요.");
    }, 15000);

    map.on("error", ({ error: mapError }) => {
      const status = (mapError as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        setError("Mapbox 요청이 거부되었습니다. 공개 토큰의 권한과 허용 URL을 확인하세요.");
      } else if (!rendered) {
        setError("지도 데이터를 불러오지 못했습니다. 네트워크 연결을 확인하세요.");
      }
    });
    map.once("load", () => {
      rendered = true;
      window.clearTimeout(loadTimeout);
      setHasRendered(true);
      setError("");
    });
    map.on("webglcontextlost", () => setError("WebGL 연결이 끊겼습니다. 브라우저의 그래픽 가속을 확인하세요."));
    map.on("webglcontextrestored", () => setError(""));

    map.on("style.load", () => {
      map.setFog({
        color: "#17243a",
        "high-color": "#111d32",
        "space-color": "#030611",
        "horizon-blend": 0.12,
        "star-intensity": 0.65,
      });
      map.addSource(sourceId, {
        type: "geojson",
        data: latest.current.data,
        promoteId: "stationuuid",
      });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": ["case", ["boolean", ["feature-state", "playing"], false], "#f59e0b", "#10b981"],
          "circle-radius": ["case", ["boolean", ["feature-state", "playing"], false], 9, 5],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#d1fae5",
          "circle-stroke-opacity": 0.55,
        },
      });
      if (latest.current.playingId) {
        map.setFeatureState({ source: sourceId, id: latest.current.playingId }, { playing: true });
      }
    });

    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    map.on("click", ({ point }) => {
      if (!map.getLayer(layerId)) return;
      const options = { layers: [layerId] };
      const feature = map.queryRenderedFeatures(point, options)[0]
        ?? map.queryRenderedFeatures([
          [point.x - 5, point.y - 5],
          [point.x + 5, point.y + 5],
        ], options)[0];
      const id: unknown = feature?.properties?.stationuuid;
      const station = typeof id === "string" ? latest.current.byId.get(id) : undefined;
      if (!station) return;
      latest.current.onSelect(station);
      map.flyTo({ center: [station.geo_long, station.geo_lat], zoom: 5, speed: 1.2 });
    });

    return () => {
      window.clearTimeout(loadTimeout);
      mapRef.current = null;
      map.remove();
    };
  }, [token, validToken]);

  useEffect(() => {
    mapRef.current?.getSource<mapboxgl.GeoJSONSource>(sourceId)?.setData(data);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(sourceId) || !playingId) return;
    const target = { source: sourceId, id: playingId };
    map.setFeatureState(target, { playing: true });
    return () => {
      if (mapRef.current === map && map.getSource(sourceId)) map.removeFeatureState(target, "playing");
    };
  }, [playingId]);

  const message = !token
    ? ".env.local에 Mapbox 공개 토큰을 설정한 뒤 개발 서버를 다시 시작하세요."
    : !validToken
      ? "Mapbox 토큰 형식이 올바르지 않습니다. pk.로 시작하는 전체 공개 토큰을 입력하세요."
      : error;

  return (
    <>
      <div className="absolute inset-0">
        <div ref={container} className="size-full" aria-label="세계 라디오 방송국 지도" />
      </div>
      {message ? (
        <p role="alert" className="absolute inset-x-6 top-1/2 mx-auto w-fit rounded-xl border border-white/15 bg-black/80 px-5 py-3 text-center text-sm">
          {message}
        </p>
      ) : !hasRendered && (
        <p role="status" className="pointer-events-none absolute inset-x-6 top-1/2 mx-auto w-fit rounded-xl bg-black/80 px-5 py-3 text-sm">
          지구본을 불러오는 중…
        </p>
      )}
    </>
  );
}
