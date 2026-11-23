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
