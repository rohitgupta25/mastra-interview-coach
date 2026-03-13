"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = require("body-parser");
const axios_1 = __importDefault(require("axios"));
const mastra_1 = require("./mastra");
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
const referenceSync_1 = require("./resources/referenceSync");
function loadEnvFiles() {
    const candidateDirs = [
        process.cwd(),
        path_1.default.resolve(__dirname, ".."),
        path_1.default.resolve(__dirname, "../.."),
    ];
    const uniqueDirs = [...new Set(candidateDirs.map((dir) => path_1.default.resolve(dir)))];
    for (const dir of uniqueDirs) {
        const envPath = path_1.default.join(dir, ".env");
        if (node_fs_1.default.existsSync(envPath)) {
            dotenv_1.default.config({ path: envPath });
        }
    }
    for (const dir of uniqueDirs) {
        const envLocalPath = path_1.default.join(dir, ".env.local");
        if (node_fs_1.default.existsSync(envLocalPath)) {
            dotenv_1.default.config({ path: envLocalPath, override: true });
        }
    }
}
loadEnvFiles();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, body_parser_1.json)({ limit: "5mb" }));
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
const tokenCache = new Map();
function getBearerToken(req) {
    const header = req.header("authorization") || req.header("Authorization");
    if (!header)
        return "";
    const [scheme, token] = header.split(" ");
    if (!scheme || !token || scheme.toLowerCase() !== "bearer")
        return "";
    return token.trim();
}
async function verifyGoogleAccessToken(accessToken) {
    const cached = tokenCache.get(accessToken);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }
    try {
        const response = await axios_1.default.get("https://www.googleapis.com/oauth2/v3/tokeninfo", {
            params: { access_token: accessToken },
            timeout: 8000,
        });
        const tokenInfo = response.data;
        if (!tokenInfo?.sub)
            return null;
        if (GOOGLE_CLIENT_ID && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            return null;
        }
        const expiresAt = tokenInfo.exp ? Number(tokenInfo.exp) * 1000 : Date.now() + 5 * 60_000;
        tokenCache.set(accessToken, {
            user: tokenInfo,
            expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000,
        });
        return tokenInfo;
    }
    catch {
        return null;
    }
}
async function requireAuth(req, res, next) {
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
    req.authUser = user;
    return next();
}
// bootstrap Mastra app + register agents/tools
const { mastra, agentRegistry } = (0, mastra_1.createMastraServer)();
app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = req.authUser;
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});
// Endpoint to submit candidate answer text
app.post("/api/answer", requireAuth, async (req, res) => {
    const { sessionId, questionId, answerText } = req.body;
    try {
        // Call interview agent tool / workflow to evaluate
        const agent = agentRegistry.get("interview-agent");
        if (!agent)
            return res.status(500).json({ ok: false, error: "Agent not registered" });
        const response = await agent.call({
            input: {
                action: "evaluate_answer",
                sessionId,
                questionId,
                answerText
            }
        });
        res.json({ ok: true, result: response.output });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});
// Endpoint to request next question
app.post("/api/question", requireAuth, async (req, res) => {
    const { sessionId, level, profile } = req.body;
    try {
        const agent = agentRegistry.get("interview-agent");
        if (!agent)
            return res.status(500).json({ ok: false, error: "Agent not registered" });
        const response = await agent.call({
            input: {
                action: "next_question",
                sessionId,
                level: level ?? "medium",
                profile,
            }
        });
        res.json({ ok: true, question: response.output });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});
// Endpoint to run candidate code (optional, uses Judge0)
app.post("/api/run", requireAuth, async (req, res) => {
    const { language, source, stdin } = req.body;
    try {
        // call judge runner tool (simple wrapper)
        const runner = require("./tools/judgeRunner").runCode;
        const result = await runner({ language, source, stdin });
        res.json({ ok: true, result });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});
app.get("/api/references/status", requireAuth, (_req, res) => {
    res.json({ ok: true, status: (0, referenceSync_1.getReferenceSyncStatus)() });
});
app.post("/api/references/sync", requireAuth, async (_req, res) => {
    try {
        const status = await (0, referenceSync_1.syncInterviewReferences)("manual_api");
        res.json({ ok: true, status });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});
const port = process.env.PORT ?? 4000;
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
