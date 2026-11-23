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
