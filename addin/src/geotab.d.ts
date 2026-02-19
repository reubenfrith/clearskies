// Type declarations for the MyGeotab Add-In JavaScript API
// Injected by the MyGeotab framework at runtime.

export interface GeotabApi {
  /** Make an authenticated call to the Geotab API */
  call(
    method: string,
    params: Record<string, unknown>,
    success: (result: unknown) => void,
    error: (err: unknown) => void
  ): void;
}

export interface GeotabState {
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
  gotoPage(page: string, params?: Record<string, unknown>): void;
  hasAccessToPage(hash: string): boolean;
  getGroupFilter(): string[];
  getAdvancedGroupFilter(): unknown;
}

export interface GeotabAddinLifecycle {
  initialize(api: GeotabApi, state: GeotabState, callback: () => void): void;
  focus(api: GeotabApi, state: GeotabState): void;
  blur(api: GeotabApi, state: GeotabState): void;
}

declare global {
  interface Window {
    geotab: {
      addin: {
        clearskies?: GeotabAddinLifecycle;
      };
    };
  }
}
