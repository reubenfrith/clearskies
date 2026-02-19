import React, { createContext, useContext, useRef, useState } from "react";
import type { GeotabApi } from "../geotab.js";

interface GeotabContextValue {
  apiRef: React.MutableRefObject<GeotabApi | null>;
  /** Flips to true when MyGeotab calls initialize() and passes the API. */
  apiReady: boolean;
}

const GeotabContext = createContext<GeotabContextValue>({
  apiRef: { current: null },
  apiReady: false,
});

// Module-level handles so setGeotabApi() can be called from main.tsx
// before or after the provider mounts.
let _apiRef: React.MutableRefObject<GeotabApi | null> | null = null;
let _setApiReady: ((ready: boolean) => void) | null = null;

export function setGeotabApi(api: GeotabApi) {
  if (_apiRef) _apiRef.current = api;
  if (_setApiReady) _setApiReady(true);
}

export function GeotabProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<GeotabApi | null>(null);
  const [apiReady, setApiReady] = useState(false);

  _apiRef = ref;
  _setApiReady = setApiReady;

  return (
    <GeotabContext.Provider value={{ apiRef: ref, apiReady }}>
      {children}
    </GeotabContext.Provider>
  );
}

export function useGeotabApi(): GeotabContextValue {
  return useContext(GeotabContext);
}
