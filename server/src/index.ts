import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { json } from "body-parser";
import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { createMastraServer } from "./mastra";
import fs from "node:fs";
import path from "path";
import { getReferenceSyncStatus, syncInterviewReferences } from "./resources/referenceSync";

function loadEnvFiles() {
  const candidateDirs = [
    process.cwd(),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
  ];
  const uniqueDirs = [...new Set(candidateDirs.map((dir) => path.resolve(dir)))];

  for (const dir of uniqueDirs) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }

  for (const dir of uniqueDirs) {
    const envLocalPath = path.join(dir, ".env.local");
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath, override: true });
    }
  }
}

loadEnvFiles();

const app = express();
app.use(cors());
app.use(json({ limit: "5mb" }));

type GoogleTokenInfo = {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  aud?: string;
  exp?: string;
  iss?: string;
};

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
const tokenCache = new Map<string, { user: GoogleTokenInfo; expiresAt: number }>();

function getBearerToken(req: Request) {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return "";
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleTokenInfo | null> {
  const cached = tokenCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const response = await axios.get<GoogleTokenInfo>(
      "https://www.googleapis.com/oauth2/v3/tokeninfo",
      {
        params: { access_token: accessToken },
        timeout: 8000,
      },
    );

    const tokenInfo = response.data;
    if (!tokenInfo?.sub) return null;

    if (GOOGLE_CLIENT_ID && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return null;
    }

    const expiresAt = tokenInfo.exp ? Number(tokenInfo.exp) * 1000 : Date.now() + 5 * 60_000;
    tokenCache.set(accessToken, {
      user: tokenInfo,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000,
    });

    return tokenInfo;
  } catch {
    return null;
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    return next();
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized: missing bearer token." });
  }

  const user = await verifyGoogleAccessToken(token);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized: invalid Google access token." });
  }

  (req as Request & { authUser?: GoogleTokenInfo }).authUser = user;
  return next();
}

// bootstrap Mastra app + register agents/tools
const { mastra, agentRegistry } = createMastraServer();

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = (req as Request & { authUser?: GoogleTokenInfo }).authUser;
  res.json({
    ok: true,
    user: {
      sub: user?.sub,
      email: user?.email,
      name: user?.name,
      picture: user?.picture,
    },
  });
});

// Endpoint to start interview session (returns session id)
app.post("/api/session", requireAuth, async (req, res) => {
  const { profile } = req.body; // e.g., { role: "FrontEnd Architect", skills: ["React","JS"] }
  try {
    const session = await mastra.createSession?.({ profile }) ?? { id: `s_${Date.now()}` };
    // For simplicity, return id and profile
    res.json({ ok: true, sessionId: session.id ?? `s_${Date.now()}`, profile });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Endpoint to submit candidate answer text
app.post("/api/answer", requireAuth, async (req, res) => {
  const { sessionId, questionId, answerText } = req.body;
  try {
    // Call interview agent tool / workflow to evaluate
    const agent = agentRegistry.get("interview-agent");
    if (!agent) return res.status(500).json({ ok:false, error: "Agent not registered" });

    const response = await agent.call({
      input: {
        action: "evaluate_answer",
        sessionId,
        questionId,
        answerText
      }
    });

    res.json({ ok:true, result: response.output });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Endpoint to request next question
app.post("/api/question", requireAuth, async (req, res) => {
  const { sessionId, level, profile } = req.body;
  try {
    const agent = agentRegistry.get("interview-agent");
    if (!agent) return res.status(500).json({ ok:false, error: "Agent not registered" });

    const response = await agent.call({
      input: {
        action: "next_question",
        sessionId,
        level: level ?? "medium",
        profile,
      }
    });

    res.json({ ok:true, question: response.output });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Endpoint to run candidate code (optional, uses Judge0)
app.post("/api/run", requireAuth, async (req, res) => {
  const { language, source, stdin } = req.body;
  try {
    // call judge runner tool (simple wrapper)
    const runner = require("./tools/judgeRunner").runCode;
    const result = await runner({ language, source, stdin });
    res.json({ ok:true, result });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.get("/api/references/status", requireAuth, (_req, res) => {
  res.json({ ok: true, status: getReferenceSyncStatus() });
});

app.post("/api/references/sync", requireAuth, async (_req, res) => {
  try {
    const status = await syncInterviewReferences("manual_api");
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
