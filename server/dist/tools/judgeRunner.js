"use strict";
/**
 * judgeRunner.ts
 *
 * Priority:
 * 1) Try Judge0 if configured
 * 2) Fallback to local JavaScript execution for dev convenience
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeRunnerTool = void 0;
exports.runCode = runCode;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_vm_1 = __importDefault(require("node:vm"));
dotenv_1.default.config();
const JUDGE0_BASE = (process.env.JUDGE0_BASE_URL || "").trim();
const JUDGE0_KEY = (process.env.JUDGE0_API_KEY || "").trim();
const JUDGE0_HOST = (process.env.JUDGE0_API_HOST || "judge0-ce.p.rapidapi.com").trim();
const JUDGE0_LOCAL_FALLBACK = process.env.JUDGE0_LOCAL_FALLBACK !== "false";
const LANGUAGE_ID_MAP = {
    javascript: 63,
    js: 63,
    typescript: 74,
    ts: 74,
    python: 71,
    py: 71,
    java: 62,
    c: 50,
    cpp: 54,
    "c++": 54,
};
function isRapidApiUrl(url) {
    return url.includes("rapidapi.com");
}
function getJudge0Headers() {
    const headers = {
        "Content-Type": "application/json",
    };
    if (JUDGE0_KEY) {
        headers["X-RapidAPI-Key"] = JUDGE0_KEY;
        if (isRapidApiUrl(JUDGE0_BASE)) {
            headers["X-RapidAPI-Host"] = JUDGE0_HOST;
        }
    }
    return headers;
}
function normalizeLanguageId(language) {
    const normalized = language.toLowerCase().trim();
    return LANGUAGE_ID_MAP[normalized] ?? 63;
}
function formatArg(value) {
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function isJavaScriptLanguage(language) {
    const normalized = language.toLowerCase().trim();
    return normalized === "javascript" || normalized === "js";
}
async function runJavaScriptLocally({ source, stdin = "" }) {
    const logs = [];
    const sandbox = {
        console: {
            log: (...args) => {
                logs.push(args.map(formatArg).join(" "));
            },
        },
        input: stdin,
    };
    node_vm_1.default.createContext(sandbox);
    try {
        const script = new node_vm_1.default.Script(source);
        const executionResult = script.runInContext(sandbox, { timeout: 3000 });
        if (executionResult && typeof executionResult.then === "function") {
            const asyncResult = await Promise.race([
                executionResult,
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("Local execution timed out.")), 3000);
                }),
            ]);
            if (asyncResult !== undefined) {
                logs.push(formatArg(asyncResult));
            }
        }
        else if (executionResult !== undefined) {
            logs.push(formatArg(executionResult));
        }
        return {
            status: { id: 3, description: "Accepted (local fallback)" },
            stdout: logs.length ? logs.join("\n") : null,
            stderr: null,
            compile_output: null,
            engine: "local-node-vm",
            note: "Executed locally because Judge0 is unavailable or unauthorized.",
        };
    }
    catch (error) {
        return {
            status: { id: 11, description: "Runtime Error (local fallback)" },
            stdout: logs.length ? logs.join("\n") : null,
            stderr: error instanceof Error ? error.stack || error.message : String(error),
            compile_output: null,
            engine: "local-node-vm",
            note: "Executed locally because Judge0 is unavailable or unauthorized.",
        };
    }
}
async function runViaJudge0({ language, source, stdin = "" }) {
    if (!JUDGE0_BASE) {
        throw new Error("JUDGE0_BASE_URL is not configured.");
    }
    const languageId = normalizeLanguageId(language);
    const payload = {
        source_code: source,
        stdin,
        language_id: languageId,
    };
    const headers = getJudge0Headers();
    const submitRes = await axios_1.default.post(`${JUDGE0_BASE}/submissions?base64_encoded=false&wait=false`, payload, { headers });
    const token = submitRes.data?.token;
    if (!token) {
        throw new Error("Judge0 did not return a submission token.");
    }
    for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        const pollRes = await axios_1.default.get(`${JUDGE0_BASE}/submissions/${token}?base64_encoded=false`, { headers });
        if (pollRes.data?.status?.id >= 3) {
            return {
                status: pollRes.data.status,
                stdout: pollRes.data.stdout,
                stderr: pollRes.data.stderr,
                compile_output: pollRes.data.compile_output,
                engine: "judge0",
            };
        }
    }
    return {
        status: { id: 2, description: "Queue/Processing Timeout" },
        stdout: null,
        stderr: null,
        compile_output: null,
        engine: "judge0",
        note: "Execution timed out while waiting for Judge0 result.",
    };
}
function normalizeRemoteError(error) {
    if (axios_1.default.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        const messageFromApi = typeof data === "string"
            ? data
            : data?.error ||
                data?.message ||
                JSON.stringify(data || {});
        return {
            status,
            message: `Judge0 request failed${status ? ` (${status})` : ""}`,
            detail: messageFromApi,
        };
    }
    return {
        message: error instanceof Error ? error.message : String(error),
    };
}
async function runCode({ language = "javascript", source, stdin = "" }) {
    if (!source || typeof source !== "string") {
        return { error: "No source code provided." };
    }
    const normalizedLanguage = String(language || "javascript").toLowerCase().trim();
    const localJsAllowed = JUDGE0_LOCAL_FALLBACK && isJavaScriptLanguage(normalizedLanguage);
    try {
        if (JUDGE0_BASE) {
            return await runViaJudge0({ language: normalizedLanguage, source, stdin });
        }
        if (localJsAllowed) {
            return await runJavaScriptLocally({ source, stdin });
        }
        return {
            error: "Judge0 is not configured. Set JUDGE0_BASE_URL (and API key/host if needed), or enable local JS fallback for JavaScript runs.",
        };
    }
    catch (error) {
        const remoteError = normalizeRemoteError(error);
        const statusCode = "status" in remoteError ? remoteError.status : undefined;
        const isUnauthorized = statusCode === 401;
        const isForbidden = statusCode === 403;
        if ((isUnauthorized || isForbidden) && isJavaScriptLanguage(normalizedLanguage)) {
            const local = await runJavaScriptLocally({ source, stdin });
            return {
                ...local,
                judge0Warning: isUnauthorized
                    ? "Judge0 returned 401 Unauthorized. Using local JavaScript fallback. Configure JUDGE0_API_KEY/JUDGE0_API_HOST for Judge0 execution."
                    : "Judge0 returned 403 Forbidden (often due to missing API subscription). Using local JavaScript fallback.",
            };
        }
        if (localJsAllowed && !JUDGE0_BASE) {
            return await runJavaScriptLocally({ source, stdin });
        }
        return {
            error: "status" in remoteError ? `${remoteError.message}: ${remoteError.detail}` : remoteError.message,
        };
    }
}
exports.judgeRunnerTool = {
    id: "judgeRunner",
    name: "judgeRunner",
    description: "Run code using Judge0 or local JavaScript fallback",
    run: async ({ input }) => {
        return await runCode(input);
    },
};
