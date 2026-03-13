import React, { useEffect, useMemo, useState } from "react";
import InterviewUI from "./components/InterviewUI";
import LoginPage, { type AuthUser } from "./components/LoginPage";
import ProfileSetupPage from "./components/ProfileSetupPage";
import { authMe, setAuthToken } from "./services/api";
import type { InterviewProfile, QuestionLevel } from "./types/interview";

type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type InterviewSetup = {
  profile: InterviewProfile;
  level: QuestionLevel;
};

const AUTH_STORAGE_KEY = "interview_coach_auth";

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [setup, setSetup] = useState<InterviewSetup | null>(null);
  const [isRestoringAuth, setIsRestoringAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as AuthSession;
        if (!parsed?.accessToken) return;

        setAuthToken(parsed.accessToken);
        const me = await authMe();
        if (!active) return;

        const mergedUser: AuthUser = {
          ...parsed.user,
          ...(me?.user || {}),
        };

        setAuth({
          accessToken: parsed.accessToken,
          user: mergedUser,
        });
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthToken(null);
      } finally {
        if (active) setIsRestoringAuth(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const userDisplayName = useMemo(
    () => auth?.user?.name || auth?.user?.email || "Google User",
    [auth],
  );

  const handleLoginSuccess = async (payload: { accessToken: string; user: AuthUser }) => {
    setAuthError("");
    setAuthToken(payload.accessToken);

    try {
      const me = await authMe();
      const mergedUser: AuthUser = {
        ...payload.user,
        ...(me?.user || {}),
      };
      const nextAuth: AuthSession = {
        accessToken: payload.accessToken,
        user: mergedUser,
      };

      setAuth(nextAuth);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
    } catch {
      setAuthToken(null);
      setAuth(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthError("Authentication failed against the server. Verify Google OAuth setup.");
    }
  };

  const logout = () => {
    setAuthToken(null);
    setAuth(null);
    setSetup(null);
    setAuthError("");
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const startInterview = (payload: InterviewSetup) => {
    setSetup(payload);
  };

  const backToProfile = () => {
    setSetup(null);
  };

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb--one" aria-hidden />
      <div className="bg-orb bg-orb--two" aria-hidden />
      <main className="app-container">
        <header className="hero-card">
          <div className="hero-top">
            <span className="hero-chip">SayDhwa Labs</span>
            {auth && (
              <div className="user-chip-wrap">
                <span className="hero-chip hero-chip--user">{userDisplayName}</span>
                <button className="btn btn--subtle" onClick={logout}>
                  Logout
                </button>
              </div>
            )}
          </div>
          <h1>Interview Coach</h1>
          <p>
            A comprehensive interview preparation environment focused on Tier-A frontend roles, helping developers strengthen expertise in JavaScript, React, frontend architecture, system design, Adobe Commerce Edge Delivery Services (EDS), and Adobe Commerce Drop-ins through guided challenges and immediate feedback.
          </p>
        </header>
        {isRestoringAuth && (
          <section className="panel reveal">
            <p className="auth-copy">Restoring login session...</p>
          </section>
        )}

        {!isRestoringAuth && !auth && (
          <>
            {authError && <div className="inline-error">{authError}</div>}
            <LoginPage onSuccess={handleLoginSuccess} />
          </>
        )}

        {!isRestoringAuth && auth && !setup && (
          <ProfileSetupPage onStart={startInterview} />
        )}

        {!isRestoringAuth && auth && setup && (
          <InterviewUI profile={setup.profile} level={setup.level} onBackToProfile={backToProfile} />
        )}
      </main>
    </div>
  );
}
