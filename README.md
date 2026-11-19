# 세계 라디오

React, Vite, TypeScript, Tailwind CSS로 만든 Mapbox 지구본 라디오입니다.

## 설치 및 실행

```bash
npm install
npm run dev
```

기존 Vite 프로젝트에 옮길 경우 사용하는 패키지입니다.

```bash
npm install react react-dom mapbox-gl@^3 lucide-react
npm install -D typescript vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @types/react @types/react-dom @types/geojson
```

프로젝트 루트의 `.env.local` 또는 `.env`에 Mapbox 공개 토큰을 설정하고 개발 서버를 다시 시작합니다.

```dotenv
VITE_MAPBOX_ACCESS_TOKEN=pk.your_public_token
```

`npm run build`는 타입 검사와 프로덕션 빌드를 실행합니다. `npm run preview`로 빌드 결과를 확인할 수 있습니다.

## 파일 구조

```text
index.html
vite.config.mts
tsconfig.vite.json
src/
  main.tsx
  styles.css
  vite-env.d.ts
  App.tsx
  types/radio.ts
  hooks/useRadioStations.ts
  components/GlobeMap.tsx
  components/AudioPlayerBar.tsx
```

[Radio Browser API 문서](https://docs.radio-browser.info/)에 명시된 HTTPS API 미러를 사용합니다. HTTPS 페이지에서 HTTP 스트림은 브라우저 정책에 따라 재생에 실패할 수 있으며 플레이어에 오류와 재시도 버튼이 표시됩니다.

## 전체 소스

### src/types/radio.ts

```ts
export interface RadioStation {
  stationuuid: string;
  name: string;
  country: string;
  state: string;
  tags: string;
  geo_lat: number;
  geo_long: number;
  url_resolved: string;
  lastcheckok: 1;
}
```

### src/hooks/useRadioStations.ts

```ts
import { useEffect, useState } from "react";
import type { RadioStation } from "../types/radio";

const endpoint = "https://de1.api.radio-browser.info/json/stations/search";
const params = new URLSearchParams({
  limit: "300",
  hidebroken: "true",
  lastcheckok: "1",
  has_geo_info: "true",
  order: "clickcount",
  reverse: "true",
});

function isRadioStation(value: unknown): value is RadioStation {
  if (!value || typeof value !== "object") return false;
  const station = value as Record<string, unknown>;
  const { geo_lat, geo_long, url_resolved } = station;
  if (
    typeof station.stationuuid !== "string" || !station.stationuuid ||
    typeof station.name !== "string" ||
    typeof station.country !== "string" ||
    typeof station.state !== "string" ||
    typeof station.tags !== "string" ||
    station.lastcheckok !== 1 ||
    typeof geo_lat !== "number" || !Number.isFinite(geo_lat) || Math.abs(geo_lat) > 90 ||
    typeof geo_long !== "number" || !Number.isFinite(geo_long) || Math.abs(geo_long) > 180 ||
    typeof url_resolved !== "string"
  ) return false;

  try {
    return ["http:", "https:"].includes(new URL(url_resolved).protocol);
  } catch {
    return false;
  }
}

export function useRadioStations() {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStations() {
      try {
        const response = await fetch(`${endpoint}?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error(String(response.status));
        const results: unknown = await response.json();
        if (!Array.isArray(results)) throw new Error("Invalid response");
        if (!controller.signal.aborted) setStations(results.filter(isRadioStation));
      } catch {
        if (!controller.signal.aborted) setErrorMessage("방송국 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadStations();
    return () => controller.abort();
  }, [request]);

  function retry() {
    setErrorMessage("");
    setIsLoading(true);
    setRequest((previous) => previous + 1);
  }

  return { stations, isLoading, errorMessage, retry };
}
```

### src/components/GlobeMap.tsx

```tsx
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
```

### src/components/AudioPlayerBar.tsx

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AudioLines, LoaderCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { RadioStation } from "../types/radio";

export interface AudioPlayerHandle {
  playStation: (station: RadioStation) => void;
}

interface Props {
  onPlayingChange: (stationId: string | null) => void;
}

const streamError = "스트림을 재생할 수 없습니다. 다시 시도하거나 다른 방송국을 선택하세요.";
const control = "grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-40";

export const AudioPlayerBar = forwardRef<AudioPlayerHandle, Props>(function AudioPlayerBar({ onPlayingChange }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const attempt = useRef(0);
  const selected = useRef<RadioStation | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [station, setStation] = useState<RadioStation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.7;
    return () => {
      attempt.current += 1;
      clearTimeout(timeout.current);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  function stop(message = "") {
    attempt.current += 1;
    clearTimeout(timeout.current);
    audioRef.current?.pause();
    setIsLoading(false);
    setIsPlaying(false);
    setErrorMessage(message);
    onPlayingChange(null);
  }

  function playStation(next: RadioStation) {
    const audio = audioRef.current;
    if (!audio) return;
    const id = ++attempt.current;
    clearTimeout(timeout.current);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    selected.current = next;
    setStation(next);
    setErrorMessage("");
    setIsPlaying(false);
    setIsLoading(true);
    onPlayingChange(null);
    audio.src = next.url_resolved;
    audio.load();
    timeout.current = setTimeout(() => {
      if (id === attempt.current) stop("스트림 응답 시간이 초과되었습니다. 다시 시도하세요.");
    }, 15000);
    void audio.play().catch((error: unknown) => {
      if (id !== attempt.current) return;
      stop(error instanceof DOMException && error.name === "NotAllowedError"
        ? "자동 재생이 차단되었습니다. 재생 버튼을 눌러 주세요."
        : streamError);
    });
  }

  useImperativeHandle(ref, () => ({ playStation }));
  const location = station && [station.country, station.state].filter(Boolean).join(" · ");
  const tags = station?.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

  return (
    <section aria-label="라디오 플레이어" className="absolute inset-x-4 bottom-10 mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-white/15 bg-black/70 p-4 shadow-2xl backdrop-blur-md sm:flex-nowrap sm:px-5">
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => {
          const audio = audioRef.current;
          if (!audio || audio.paused || !selected.current) return;
          clearTimeout(timeout.current);
          setIsLoading(false);
          setIsPlaying(true);
          onPlayingChange(selected.current.stationuuid);
        }}
        onError={() => {
          if (audioRef.current?.error) stop(streamError);
        }}
        onEnded={() => stop("스트림이 종료되었습니다. 다시 재생할 수 있습니다.")}
      />
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
        <AudioLines size={21} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
        <h2 className="truncate text-base font-semibold">{station?.name || "방송국 선택"}</h2>
        <p aria-live="polite" className={`text-sm ${errorMessage ? "text-amber-300" : "text-slate-300"}`}>
          {errorMessage || (isLoading ? "스트림 연결 중…" : station ? (isPlaying ? "재생 중" : "일시정지") : "지구본의 초록색 점을 선택하세요.")}
        </p>
        {station && <p className="truncate text-xs text-slate-400" title={[location, tags?.join(", ")].filter(Boolean).join(" · ")}>
          {[location, tags?.join(", ")].filter(Boolean).join(" · ")}
        </p>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={`${control} bg-emerald-400 text-black hover:bg-emerald-300`}
          aria-label={isLoading ? "연결 취소" : isPlaying ? "일시정지" : "재생"}
          disabled={!station}
          onClick={() => {
            if (isPlaying || isLoading) stop();
            else if (station) playStation(station);
          }}
        >
          {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          className={control}
          aria-label={muted ? "음소거 해제" : "음소거"}
          onClick={() => {
            if (!audioRef.current) return;
            audioRef.current.muted = !muted;
            setMuted(!muted);
          }}
        >
          {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
        <input
          type="range"
          aria-label="볼륨"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          className="w-24 accent-emerald-400"
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (audioRef.current) audioRef.current.volume = next;
            setVolume(next);
          }}
        />
      </div>
    </section>
  );
});
```

### src/App.tsx

```tsx
import { useRef, useState } from "react";
import { RadioTower } from "lucide-react";
import { AudioPlayerBar, type AudioPlayerHandle } from "./components/AudioPlayerBar";
import { GlobeMap } from "./components/GlobeMap";
import { useRadioStations } from "./hooks/useRadioStations";

export default function App({ mapboxToken }: { mapboxToken?: string }) {
  const { stations, isLoading, errorMessage, retry } = useRadioStations();
  const player = useRef<AudioPlayerHandle>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <main className="relative h-dvh overflow-hidden bg-[#030611] text-slate-100">
      <GlobeMap
        accessToken={mapboxToken}
        stations={stations}
        playingId={playingId}
        onSelect={(station) => player.current?.playStation(station)}
      />
      <header className="absolute left-4 top-4 max-w-[calc(100%-5rem)] rounded-2xl border border-white/15 bg-black/70 px-4 py-3 backdrop-blur-md sm:left-6 sm:top-6">
        <h1 className="flex items-center gap-2 font-semibold">
          <RadioTower size={19} className="text-emerald-400" aria-hidden="true" />
          세계 라디오
        </h1>
        <p aria-live="polite" className="mt-1 text-sm text-slate-300">
          {errorMessage || (isLoading ? "방송국을 불러오는 중…" : stations.length ? `방송국 ${stations.length}개` : "표시할 방송국이 없습니다.")}
        </p>
        {!isLoading && !stations.length && (
          <button type="button" onClick={retry} className="mt-2 text-sm font-medium text-emerald-300 underline">
            다시 불러오기
          </button>
        )}
      </header>
      <AudioPlayerBar ref={player} onPlayingChange={setPlayingId} />
    </main>
  );
}
```

### src/main.tsx

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App mapboxToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN} />
  </StrictMode>,
);
```

### src/styles.css

```css
@import "tailwindcss";
```

### src/vite-env.d.ts

```ts
/// <reference types="vite/client" />
```

### vite.config.mts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

### tsconfig.vite.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src/App.tsx", "src/main.tsx", "src/vite-env.d.ts", "vite.config.mts"]
}
```

### index.html

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>세계 라디오</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
