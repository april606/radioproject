"use client";

import App from "../App";

export default function Home() {
  return <App mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN} />;
}
