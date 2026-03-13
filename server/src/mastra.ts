import { InterviewAgent } from "./agents/interviewAgent";
import { startReferenceAutoSync } from "./resources/referenceSync";

type Session = {
  id: string;
  createdAt: number;
  profile?: unknown;
};

type SessionStore = Map<string, Session>;

type SimpleMastra = {
  createSession: ({ profile }: { profile?: unknown }) => Promise<Session>;
};

function buildSessionId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMastraServer() {
  const sessions: SessionStore = new Map();

  const mastra: SimpleMastra = {
    async createSession({ profile }) {
      const session: Session = {
        id: buildSessionId(),
        createdAt: Date.now(),
        profile,
      };
      sessions.set(session.id, session);
      return session;
    },
  };

  const interviewAgent = new InterviewAgent({ mastra, sessions });
  const agentRegistry = new Map<string, InterviewAgent>();
  agentRegistry.set("interview-agent", interviewAgent);
  startReferenceAutoSync();

  return { mastra, agentRegistry };
}
