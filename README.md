# 세계 라디오

Next.js App Router, TypeScript, Tailwind CSS, Mapbox로 만든 지구본 라디오입니다. 방송국을 선택하면 현지 날씨와 시각이 표시되고 라디오와 환경음 볼륨을 따로 조절할 수 있습니다.

## 설치 및 실행

```bash
npm install
npm run dev
```

프로젝트 루트의 `.env.local`에 다음 값을 설정하고 서버를 다시 시작하세요.

```dotenv
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token
OPENWEATHER_API_KEY=your_openweather_api_key
```

`npm run build`로 프로덕션 빌드를 만들고 `npm start`로 실행합니다. PowerShell에서 npm 스크립트가 차단되면 `npm.cmd`를 사용하세요.

날씨 API는 방송국 좌표로 [OpenWeather Current Weather API](https://openweathermap.org/api/current)를 조회합니다. 원본 날씨 데이터는 좌표별로 30분 동안 캐시하며, 현지 시각과 낮·밤 여부는 조회 시 계산합니다. 날씨 조회가 실패해도 라디오와 수동 환경음 선택을 사용할 수 있습니다.

## 테스트용 환경음 준비

`public/sounds/` 폴더를 만들고 사용 권한이 있는 MP3 파일을 다음 이름으로 넣으세요. 첫 테스트에서는 같은 MP3를 네 이름으로 복사해도 됩니다. 날씨별 소리를 구분하려면 각각 다른 녹음을 사용하세요.

| 파일 | 환경음 |
| --- | --- |
| `public/sounds/rain.mp3` | 비 |
| `public/sounds/wind.mp3` | 바람 |
| `public/sounds/night.mp3` | 풀벌레 |
| `public/sounds/waves.mp3` | 파도 |

지구본에서 방송국을 고르고 환경음 셀렉터에서 각 파일을 전환해 보세요. 라디오를 일시정지하면 환경음도 멈춥니다. 파일이 누락되거나 로드에 실패하면 브라우저 개발자 도구 콘솔에 경고가 표시됩니다.

## 2단계 전체 소스

### src/types/weather.ts

```ts
export type WeatherCondition =
  | "Rain"
  | "Drizzle"
  | "Thunderstorm"
  | "Snow"
  | "Clear"
  | "Clouds"
  | "Atmosphere";

export interface Weather {
  temp: number;
  condition: WeatherCondition;
  description: string;
  localTime: string;
  isDay: boolean;
}

export type AmbientType = "rain" | "wind" | "night" | "waves";
export type AmbientMode = AmbientType | "auto" | "off";

export interface AmbientSound {
  type: AmbientType;
  label: string;
  icon: "cloud-rain" | "wind" | "moon" | "waves";
  src: `/sounds/${AmbientType}.mp3`;
}
```

### src/app/api/weather/route.ts

```ts
import type { Weather, WeatherCondition } from "../../../types/weather";

const conditions: readonly WeatherCondition[] = [
  "Rain", "Drizzle", "Thunderstorm", "Snow", "Clear", "Clouds", "Atmosphere",
];

const localTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function coordinate(value: string | null, limit: number) {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function unavailable() {
  return Response.json({ error: "날씨 데이터를 가져오지 못했습니다." }, { status: 502 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = coordinate(searchParams.get("lat"), 90);
  const lon = coordinate(searchParams.get("lon"), 180);
  if (lat === null || lon === null) {
    return Response.json({ error: "유효한 위도와 경도가 필요합니다." }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) {
    return Response.json({ error: "날씨 서비스를 사용할 수 없습니다." }, { status: 503 });
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.search = new URLSearchParams({
    lat: String(lat), lon: String(lon), appid: key, units: "metric",
  }).toString();

  try {
    const response = await fetch(url, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return unavailable();

    const data = await response.json();
    const temp: unknown = data?.main?.temp;
    const timezone: unknown = data?.timezone;
    const sunrise: unknown = data?.sys?.sunrise;
    const sunset: unknown = data?.sys?.sunset;
    const main: unknown = data?.weather?.[0]?.main;
    const description: unknown = data?.weather?.[0]?.description;
    if (
      typeof temp !== "number" || !Number.isFinite(temp) ||
      typeof timezone !== "number" || !Number.isFinite(timezone) ||
      typeof sunrise !== "number" || !Number.isFinite(sunrise) ||
      typeof sunset !== "number" || !Number.isFinite(sunset) ||
      typeof main !== "string" || typeof description !== "string"
    ) return unavailable();

    const now = Date.now();
    const weather: Weather = {
      temp: Math.round(temp),
      condition: conditions.find((condition) => condition === main) ?? "Atmosphere",
      description,
      localTime: localTimeFormat.format(now + timezone * 1000),
      isDay: now / 1000 >= sunrise && now / 1000 < sunset,
    };
    return Response.json(weather, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable();
  }
}
```

### src/utils/ambientSound.ts

```ts
import type { AmbientSound, AmbientType, Weather } from "../types/weather";

export const ambientSounds: Record<AmbientType, AmbientSound> = {
  rain: { type: "rain", label: "빗소리 (Rain)", icon: "cloud-rain", src: "/sounds/rain.mp3" },
  wind: { type: "wind", label: "겨울 바람 (Winter Wind)", icon: "wind", src: "/sounds/wind.mp3" },
  night: { type: "night", label: "밤의 풀벌레 (Night Crickets)", icon: "moon", src: "/sounds/night.mp3" },
  waves: { type: "waves", label: "잔잔한 파도/산들바람 (Breeze)", icon: "waves", src: "/sounds/waves.mp3" },
};

export function getAmbientSound({ condition, isDay }: Pick<Weather, "condition" | "isDay">): AmbientSound {
  switch (condition) {
    case "Rain":
    case "Drizzle":
    case "Thunderstorm":
      return ambientSounds.rain;
    case "Snow":
    case "Atmosphere":
      return ambientSounds.wind;
    case "Clear":
      return isDay ? ambientSounds.waves : ambientSounds.night;
    case "Clouds":
      return ambientSounds.waves;
  }
}
```

### src/components/AudioPlayerBar.tsx

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AudioLines, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, LoaderCircle, Moon, Pause, Play, Sun, Volume2, VolumeX, Waves, Wind } from "lucide-react";
import type { RadioStation } from "../types/radio";
import type { AmbientMode, Weather } from "../types/weather";
import { ambientSounds, getAmbientSound } from "../utils/ambientSound";

export interface AudioPlayerHandle {
  selectStation: (station: RadioStation) => void;
}

interface Props {
  onPlayingChange: (stationId: string | null) => void;
}

const streamError = "스트림을 재생할 수 없습니다. 다시 시도하거나 다른 방송국을 선택하세요.";
const control = "grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-40";
const weatherIcons = {
  Rain: CloudRain, Drizzle: CloudDrizzle, Thunderstorm: CloudLightning,
  Snow: CloudSnow, Clear: Sun, Clouds: Cloud, Atmosphere: CloudFog,
};
const ambientIcons = { "cloud-rain": CloudRain, wind: Wind, moon: Moon, waves: Waves };

export const AudioPlayerBar = forwardRef<AudioPlayerHandle, Props>(function AudioPlayerBar({ onPlayingChange }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ambientRef = useRef<HTMLAudioElement>(null);
  const weatherRequest = useRef<AbortController | null>(null);
  const attempt = useRef(0);
  const selected = useRef<RadioStation | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [station, setStation] = useState<RadioStation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [ambientMode, setAmbientMode] = useState<AmbientMode>("auto");
  const [ambientVolume, setAmbientVolume] = useState(0.3);
  const ambient = ambientMode === "off" ? null :
    ambientMode === "auto" ? (weather && getAmbientSound(weather)) : ambientSounds[ambientMode];
  const ambientSrc = ambient?.src;
  const WeatherIcon = weather?.condition === "Clear" && !weather.isDay ? Moon :
    weather && weatherIcons[weather.condition];
  const AmbientIcon = ambient ? ambientIcons[ambient.icon] : Waves;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.7;
    return () => {
      attempt.current += 1;
      clearTimeout(timeout.current);
      weatherRequest.current?.abort();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  useEffect(() => {
    if (ambientRef.current) ambientRef.current.volume = ambientVolume;
  }, [ambientVolume]);

  useEffect(() => {
    const audio = ambientRef.current;
    if (!audio || !isPlaying || !ambientEnabled || !ambientSrc) return;

    let active = true;
    void audio.play().catch((error: unknown) => {
      if (active && !audio.error && !(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("환경음을 재생하지 못했습니다.", ambientSrc);
      }
    });
    return () => {
      active = false;
      audio.pause();
    };
  }, [ambientEnabled, ambientSrc, isPlaying]);

  function stop(message = "") {
    attempt.current += 1;
    clearTimeout(timeout.current);
    audioRef.current?.pause();
    ambientRef.current?.pause();
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
    ambientRef.current?.pause();
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

  function selectStation(next: RadioStation) {
    weatherRequest.current?.abort();
    const controller = new AbortController();
    weatherRequest.current = controller;
    setWeather(null);
    setWeatherStatus("loading");
    playStation(next);

    const params = new URLSearchParams({
      lat: String(next.geo_lat),
      lon: String(next.geo_long),
    });
    void (async () => {
      try {
        const response = await fetch(`/api/weather?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Weather request failed");
        const result: Weather = await response.json();
        if (controller.signal.aborted) return;
        setWeather(result);
        setWeatherStatus("idle");
      } catch {
        if (!controller.signal.aborted) setWeatherStatus("unavailable");
      }
    })();
  }

  useImperativeHandle(ref, () => ({ selectStation }));
  const location = station && [station.country, station.state].filter(Boolean).join(" · ");
  const tags = station?.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

  return (
    <section aria-label="라디오 플레이어" className="absolute inset-x-4 bottom-10 mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-white/15 bg-black/70 p-4 shadow-2xl backdrop-blur-md sm:px-5">
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
      <audio
        ref={ambientRef}
        src={ambientSrc}
        preload="none"
        loop
        onError={() => {
          if (ambientSrc && ambientRef.current?.error) {
            console.warn("환경음 파일을 불러오지 못했습니다.", ambientSrc);
          }
        }}
      />
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
        <AudioLines size={21} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="truncate text-base font-semibold">{station?.name || "방송국 선택"}</h2>
          <div aria-live="polite" className="text-xs text-slate-300">
            {weather && WeatherIcon && (
              <span title={weather.description} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                <WeatherIcon size={14} aria-hidden="true" />
                {weather.temp}°C {weather.condition} • {weather.localTime}
              </span>
            )}
            {weatherStatus === "loading" && "현지 날씨 조회 중"}
            {weatherStatus === "unavailable" && "현지 날씨를 불러오지 못했습니다"}
          </div>
        </div>
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
          aria-label="라디오 볼륨"
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
      <div className="flex w-full flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-sm">
        <button
          type="button"
          aria-label="환경음"
          aria-pressed={ambientEnabled && ambientMode !== "off"}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
          onClick={() => {
            if (ambientMode === "off") {
              setAmbientMode("auto");
              setAmbientEnabled(true);
            } else {
              setAmbientEnabled(!ambientEnabled);
            }
          }}
        >
          <AmbientIcon size={16} aria-hidden="true" />
          환경음 {ambientEnabled && ambientMode !== "off" ? "ON" : "OFF"}
        </button>
        <select
          aria-label="환경음 종류"
          title={ambient?.label}
          value={ambientMode}
          className="max-w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5"
          onChange={(event) => {
            const mode = event.currentTarget.value as AmbientMode;
            setAmbientMode(mode);
            setAmbientEnabled(mode !== "off");
          }}
        >
          <option value="auto">자동 (현지 날씨)</option>
          <option value="rain">비</option>
          <option value="wind">바람</option>
          <option value="night">밤</option>
          <option value="waves">파도</option>
          <option value="off">끄기</option>
        </select>
        <label className="flex items-center gap-2 text-slate-300 sm:ml-auto">
          환경음 볼륨
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={ambientVolume}
            className="w-24 accent-sky-400"
            onChange={(event) => setAmbientVolume(event.currentTarget.valueAsNumber)}
          />
        </label>
      </div>
    </section>
  );
});
```

### src/app/page.tsx

```tsx
import App from "../App";

export default function Home() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;
  return <App mapboxToken={mapboxToken} />;
}
```

### src/App.tsx

```tsx
"use client";

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
        onSelect={(station) => player.current?.selectStation(station)}
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
