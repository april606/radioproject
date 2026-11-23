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
