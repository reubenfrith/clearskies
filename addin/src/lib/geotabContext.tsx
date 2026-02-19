import React, { createContext, useContext, useRef } from "react";
import type { GeotabApi } from "../geotab.js";

type ApiRef = React.MutableRefObject<GeotabApi | null>;

const GeotabContext = createContext<ApiRef>({ current: null });

// Module-level ref so main.tsx can call setGeotabApi without needing
// a hook (i.e. before React mounts).
let _contextRef: ApiRef | null = null;

export function setGeotabApi(api: GeotabApi) {
  if (_contextRef) {
    _contextRef.current = api;
  }
}

export function GeotabProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<GeotabApi | null>(null);
  _contextRef = ref;
  return <GeotabContext.Provider value={ref}>{children}</GeotabContext.Provider>;
}

/** Returns the mutable ref. Check `.current` — null means running in dev mode. */
export function useGeotabApi(): ApiRef {
  return useContext(GeotabContext);
}
