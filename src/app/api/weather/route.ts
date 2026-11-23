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
