import { useState, type FormEvent } from "react";
import { ApiError, changePassword, deleteAccount } from "@/lib/api";

type AccountSettingsProps = {
  onAccountDeleted: () => void;
};

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

const describe = (err: unknown, fallback: string) => {
  if (err instanceof ApiError && err.status === 403) {
    return "That password is incorrect.";
  }
  if (err instanceof ApiError && err.status === 422) {
    return "The new password must be at least 8 characters.";
  }
  return fallback;
};

export const AccountSettings = ({ onAccountDeleted }: AccountSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Other devices were signed out.");
    } catch (err) {
      setError(describe(err, "Could not change the password."));
    }
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!window.confirm("Permanently delete your account and all your boards?")) {
      return;
    }
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (err) {
      setError(describe(err, "Could not delete the account."));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="self-start rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
      >
        Account
      </button>
      {isOpen && (
        <div className="grid gap-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-5 md:grid-cols-2">
          <form onSubmit={handleChange} className="flex flex-col gap-3" aria-label="Change password">
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Change password
            </h2>
            <label className={labelClass}>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className={`${inputClass} mt-2`}
                required
              />
            </label>
            <label className={labelClass}>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className={`${inputClass} mt-2`}
                required
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Change password
            </button>
          </form>
          <form onSubmit={handleDelete} className="flex flex-col gap-3" aria-label="Delete account">
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Delete account
            </h2>
            <label className={labelClass}>
              Confirm with your password
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
                className={`${inputClass} mt-2`}
                required
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white"
            >
              Delete account
            </button>
          </form>
          {message && (
            <p role="status" className="text-sm font-medium text-[var(--primary-blue-text)] md:col-span-2">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)] md:col-span-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
