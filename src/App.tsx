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
