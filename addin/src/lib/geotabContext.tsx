import React, { createContext, useContext, useEffect, useRef, useState } from "react";
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

// _pendingApi holds the API even if initialize() fired before GeotabProvider mounted.
// _apiRef / _setApiReady are set during render and used for post-mount calls.
let _pendingApi: GeotabApi | null = null;
let _apiRef: React.MutableRefObject<GeotabApi | null> | null = null;
let _setApiReady: ((ready: boolean) => void) | null = null;

export function setGeotabApi(api: GeotabApi) {
  _pendingApi = api;            // always store, regardless of mount timing
  if (_apiRef) _apiRef.current = api;   // update ref if already mounted
  if (_setApiReady) _setApiReady(true); // trigger re-render if already mounted
}

export function GeotabProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<GeotabApi | null>(null);
  const [apiReady, setApiReady] = useState(false);

  // Set module-level handles during render so they're available ASAP
  _apiRef = ref;
  _setApiReady = setApiReady;

  // Catch the race: initialize() fired before this component mounted.
  // _pendingApi will already be set; apply it now.
  useEffect(() => {
    if (_pendingApi && !apiReady) {
      ref.current = _pendingApi;
      setApiReady(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GeotabContext.Provider value={{ apiRef: ref, apiReady }}>
      {children}
    </GeotabContext.Provider>
  );
}

export function useGeotabApi(): GeotabContextValue {
  return useContext(GeotabContext);
}
