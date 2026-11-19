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
