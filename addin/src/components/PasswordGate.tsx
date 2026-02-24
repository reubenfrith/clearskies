import { useState } from "react";
import { Button, ButtonType, TextInput } from "@geotab/zenith";

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
          <TextInput
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            error={error ? "Incorrect password. Try again." : undefined}
          />
          <Button htmlType="submit" type={ButtonType.Primary}>
            Enter
          </Button>
        </form>
      </div>
    </div>
  );
}
