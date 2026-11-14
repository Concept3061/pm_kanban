"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";
import { getMe } from "@/lib/api";

export const AuthGate = () => {
  // undefined until the session check finishes, null when signed out.
  const [username, setUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.username))
      .catch(() => setUsername(null));
  }, []);

  if (username === undefined) {
    return null;
  }
  if (username === null) {
    return <LoginForm onLogin={setUsername} />;
  }
  return <Workspace username={username} onSignedOut={() => setUsername(null)} />;
};
