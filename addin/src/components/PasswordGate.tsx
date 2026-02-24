import { useState } from "react";

const APP_PASSWORD =
  (import.meta.env.VITE_APP_PASSWORD as string | undefined) ?? "";

const SESSION_KEY = "clearskies_auth";

export function usePasswordGate(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "true"
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  if (authenticated) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setAuthenticated(true);
    } else {
      setError(true);
      setInput("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl">🌤️</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">ClearSkies</h1>
          <p className="text-sm text-gray-500 mt-1">Enter the access password to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && (
            <p className="text-xs text-red-600">Incorrect password. Try again.</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
