import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "@/lib/api";

type LoginFormProps = {
  onLogin: (username: string) => void;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const errorMessage = (err: unknown, isRegistering: boolean) => {
  if (err instanceof ApiError) {
    if (!isRegistering && err.status === 401) {
      return "Invalid username or password.";
    }
    if (isRegistering && err.status === 409) {
      return "That username is taken.";
    }
    if (isRegistering && err.status === 422) {
      return "Use a username of 3 to 32 letters, numbers, . _ - and a password of at least 8 characters.";
    }
  }
  return isRegistering
    ? "Could not create the account. Please try again."
    : "Could not sign in. Please try again.";
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const user = isRegistering
        ? await register(username, password)
        : await login(username, password);
      onLogin(user.username);
    } catch (err) {
      setError(errorMessage(err, isRegistering));
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          {isRegistering ? "Create an account to get started." : "Sign in to see your boards."}
        </p>
        <label className="mt-6 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className={inputClass}
            required
          />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
            className={inputClass}
            required
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {isRegistering ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs font-semibold text-[var(--primary-blue-text)]"
        >
          {isRegistering ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
};
