import React, { useEffect, useMemo, useState } from "react";

export type AuthUser = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-google-oauth='true']");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleOauth = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script."));
    document.head.appendChild(script);
  });
}

async function fetchGoogleUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch Google user profile.");
  }

  const user = await response.json();
  return {
    sub: String(user.sub || ""),
    email: user.email ? String(user.email) : undefined,
    name: user.name ? String(user.name) : undefined,
    picture: user.picture ? String(user.picture) : undefined,
  };
}

type Props = {
  onSuccess: (payload: { accessToken: string; user: AuthUser }) => void;
};

export default function LoginPage({ onSuccess }: Props) {
  const [error, setError] = useState("");
  const [isLoadingScript, setIsLoadingScript] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const googleClientId = useMemo(() => (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim(), []);

  useEffect(() => {
    let active = true;
    void loadGoogleScript()
      .then(() => {
        if (active) {
          setIsLoadingScript(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load Google OAuth.");
          setIsLoadingScript(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const loginWithGoogle = () => {
    setError("");
    if (!googleClientId) {
      setError("Missing VITE_GOOGLE_CLIENT_ID in web environment.");
      return;
    }

    const oauth = window.google?.accounts?.oauth2;
    if (!oauth?.initTokenClient) {
      setError("Google OAuth is not ready yet.");
      return;
    }

    setIsSigningIn(true);
    const tokenClient = oauth.initTokenClient({
      client_id: googleClientId,
      scope: "openid email profile",
      callback: async (response) => {
        try {
          if (response.error || !response.access_token) {
            throw new Error(response.error_description || response.error || "Google login failed.");
          }

          const user = await fetchGoogleUser(response.access_token);
          onSuccess({ accessToken: response.access_token, user });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Google login failed.");
        } finally {
          setIsSigningIn(false);
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  return (
    <section className="panel auth-panel reveal">
      <h2>Sign In</h2>
      <p className="auth-copy">Use your Google account to access interview prep.</p>
      <button className="btn btn--primary" onClick={loginWithGoogle} disabled={isLoadingScript || isSigningIn}>
        {isSigningIn ? "Signing In..." : isLoadingScript ? "Preparing Google Login..." : "Continue With Google"}
      </button>
      {error && <div className="inline-error auth-error">{error}</div>}
    </section>
  );
}
