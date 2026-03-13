import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "https://mastra-interview-coach.onrender.com/";
const client = axios.create({
  baseURL: API_BASE,
});

export function setAuthToken(accessToken: string | null) {
  if (!accessToken) {
    delete client.defaults.headers.common.Authorization;
    return;
  }
  client.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
}

export async function authMe() {
  const res = await client.get("/api/auth/me");
  return res.data;
}

export async function createSession(profile: any) {
  const res = await client.post("/api/session", { profile });
  return res.data;
}

export async function requestQuestion(sessionId: string, level?: string, profile?: any) {
  const res = await client.post("/api/question", { sessionId, level, profile });
  return res.data;
}

export async function submitAnswer(sessionId: string, questionId: string, answerText: string) {
  const res = await client.post("/api/answer", { sessionId, questionId, answerText });
  return res.data;
}

export async function runCode(language: string, source: string, stdin = "") {
  const res = await client.post("/api/run", { language, source, stdin });
  return res.data;
}
