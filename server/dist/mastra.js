"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMastraServer = createMastraServer;
const interviewAgent_1 = require("./agents/interviewAgent");
const referenceSync_1 = require("./resources/referenceSync");
function buildSessionId() {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function createMastraServer() {
    const sessions = new Map();
    const mastra = {
        async createSession({ profile }) {
            const session = {
                id: buildSessionId(),
                createdAt: Date.now(),
                profile,
            };
            sessions.set(session.id, session);
            return session;
        },
    };
    const interviewAgent = new interviewAgent_1.InterviewAgent({ mastra, sessions });
    const agentRegistry = new Map();
    agentRegistry.set("interview-agent", interviewAgent);
    (0, referenceSync_1.startReferenceAutoSync)();
    return { mastra, agentRegistry };
}
