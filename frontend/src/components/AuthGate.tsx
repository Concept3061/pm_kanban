"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
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
  return <KanbanBoard username={username} onSignedOut={() => setUsername(null)} />;
};
