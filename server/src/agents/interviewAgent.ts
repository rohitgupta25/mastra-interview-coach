import axios from "axios";
import { runCode } from "../tools/judgeRunner";
import { retrieveReferenceHits } from "../tools/ragRetriever";

type Difficulty = "easy" | "medium" | "hard";
type QuestionType = "theory" | "coding";
type TargetRoleBand =
  | "associate_consultant"
  | "technical_consultant"
  | "senior_technical_consultant"
  | "technical_architect";

type RoleDefinition = {
  key: TargetRoleBand;
  label: string;
  minYears: number;
  maxYears?: number;
};

const ROLE_DEFINITIONS: RoleDefinition[] = [
  { key: "associate_consultant", label: "Associate Consultant", minYears: 1, maxYears: 3 },
  { key: "technical_consultant", label: "Technical Consultant", minYears: 3, maxYears: 7 },
  { key: "senior_technical_consultant", label: "Senior Technical Consultant", minYears: 7, maxYears: 12 },
  { key: "technical_architect", label: "Technical Architect", minYears: 13 },
];

type SessionProfile = {
  role?: string;
  roleKey?: TargetRoleBand;
  yearsExperience?: number;
  skills?: string[];
  activeSkill?: string;
} & Record<string, unknown>;

type QuestionTest = {
  stdin: string;
  expected: string;
};

type CodingTestCase = {
  description?: string;
  args: unknown[];
  expected: unknown;
};

type CodingSpec = {
  functionName: string;
  tests: CodingTestCase[];
};

type InterviewQuestion = {
  questionId: string;
  templateId: string;
  title: string;
  questionText: string;
  type: QuestionType;
  hints: string[];
  canonicalAnswer: string;
  referenceSolution?: string;
  tests: QuestionTest[];
  codingSpec?: CodingSpec;
};

type EvaluationResult = {
  score: number;
  feedback: string;
  correction: string;
  nextSteps: string[];
  tests?: Array<{
    stdin: string;
    expected: string;
    passed: boolean;
    note: string;
  }>;
};

type SessionState = {
  profile?: SessionProfile;
  questions: Map<string, InterviewQuestion>;
  evaluations: Map<string, EvaluationResult>;
  recentQuestionSignaturesByTrack: Map<string, string[]>;
  recentQuestionTopicsByTrack: Map<string, string[]>;
};

type Constructor = {
  mastra?: unknown;
  sessions?: Map<string, unknown>;
};

type AgentInput = {
  action?: "next_question" | "evaluate_answer";
  sessionId?: string;
  level?: string;
  profile?: SessionProfile;
  questionId?: string;
  answerText?: string;
};

type AgentCallRequest = {
  input?: AgentInput;
};

type AgentCallResponse = {
  output: unknown;
};

type RoleContext = {
  roleBand: TargetRoleBand;
  yearsExperience: number;
};

type GeneratedQuestionPayload = {
  title: string;
  type: QuestionType;
  questionText: string;
  hints: string[];
  canonicalAnswer: string;
  referenceSolution?: string;
  codingSpec?: {
    functionName: string;
    tests: Array<{
      description?: string;
      args: unknown[];
      expected: unknown;
    }>;
  };
};

const ROLE_LOOKUP: Record<string, TargetRoleBand> = {
  associateconsultant: "associate_consultant",
  associateconsultant13: "associate_consultant",
  technicalconsultant: "technical_consultant",
  technicalconsultant37: "technical_consultant",
  seniortechnicalconsultant: "senior_technical_consultant",
  seniortechnicalconsultant712: "senior_technical_consultant",
  technicalarchitect: "technical_architect",
  technicalarchitect13: "technical_architect",
  frontendarchitect: "technical_architect",
};

function toDifficulty(level?: string): Difficulty {
  if (level === "easy" || level === "hard" || level === "medium") {
    return level;
  }
  return "medium";
}

function buildQuestionId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeRoleValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function roleBandFromYears(years: number): TargetRoleBand {
  if (years <= 3) return "associate_consultant";
  if (years <= 7) return "technical_consultant";
  if (years <= 12) return "senior_technical_consultant";
  return "technical_architect";
}

function resolveRoleBand(rawRole?: string): TargetRoleBand | undefined {
  if (!rawRole) return undefined;
  return ROLE_LOOKUP[normalizeRoleValue(rawRole)];
}

function getRoleDefinition(roleBand: TargetRoleBand): RoleDefinition {
  return ROLE_DEFINITIONS.find((role) => role.key === roleBand) ?? ROLE_DEFINITIONS[1];
}

function parseYearsExperience(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }
  return undefined;
}

function resolveRoleContext(profile?: SessionProfile): RoleContext {
  const selectedRoleBand = profile?.roleKey || resolveRoleBand(profile?.role);
  const selectedRoleDef = selectedRoleBand ? getRoleDefinition(selectedRoleBand) : undefined;
  const rawYears = parseYearsExperience(profile?.yearsExperience);
  const yearsExperience = rawYears ?? selectedRoleDef?.minYears ?? 4;

  return {
    roleBand: selectedRoleBand ?? roleBandFromYears(yearsExperience),
    yearsExperience,
  };
}

function buildTrackKey(difficulty: Difficulty, roleContext: RoleContext, focusSkill?: string) {
  const skillKey = focusSkill ? normalizeRoleValue(focusSkill) : "all";
  return `${difficulty}:${roleContext.roleBand}:${roleContext.yearsExperience}:${skillKey}`;
}

function choosePreferredQuestionType(difficulty: Difficulty, yearsExperience: number): QuestionType {
  let theoryRatio = difficulty === "easy" ? 0.64 : difficulty === "medium" ? 0.52 : 0.42;

  if (yearsExperience <= 3) theoryRatio -= 0.12;
  if (yearsExperience >= 13) theoryRatio += 0.12;

  const bounded = Math.max(0.2, Math.min(0.85, theoryRatio));
  return Math.random() < bounded ? "theory" : "coding";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function signatureForQuestion(title: string, questionText: string) {
  return normalizeText(`${title} ${questionText}`).slice(0, 240);
}

const SIGNATURE_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "between",
  "could",
  "every",
  "from",
  "have",
  "into",
  "just",
  "need",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "with",
  "would",
  "your",
]);

function tokenizeSignature(text: string) {
  return new Set(
    normalizeText(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !SIGNATURE_STOPWORDS.has(token)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isRepeatedSignature(signature: string, recentSignatures: string[]) {
  if (recentSignatures.includes(signature)) return true;
  const currentTokens = tokenizeSignature(signature);

  return recentSignatures.some((prior) => {
    const similarity = jaccardSimilarity(currentTokens, tokenizeSignature(prior));
    return similarity >= 0.56;
  });
}

function rememberSignature(state: SessionState, trackKey: string, signature: string) {
  const existing = state.recentQuestionSignaturesByTrack.get(trackKey) ?? [];
  const next = [signature, ...existing.filter((item) => item !== signature)].slice(0, 80);
  state.recentQuestionSignaturesByTrack.set(trackKey, next);
}

function getRecentSignatures(state: SessionState, trackKey: string) {
  return state.recentQuestionSignaturesByTrack.get(trackKey) ?? [];
}

function normalizeTopic(value: string) {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isRepeatedTopic(topic: string, recentTopics: string[]) {
  const normalizedTopic = normalizeTopic(topic);
  if (!normalizedTopic) return false;
  if (recentTopics.includes(normalizedTopic)) return true;
  const topicTokens = tokenizeSignature(normalizedTopic);

  return recentTopics.some((prior) => jaccardSimilarity(topicTokens, tokenizeSignature(prior)) >= 0.7);
}

function rememberTopic(state: SessionState, trackKey: string, topic: string) {
  const normalizedTopic = normalizeTopic(topic);
  if (!normalizedTopic) return;
  const existing = state.recentQuestionTopicsByTrack.get(trackKey) ?? [];
  const next = [normalizedTopic, ...existing.filter((item) => item !== normalizedTopic)].slice(0, 60);
  state.recentQuestionTopicsByTrack.set(trackKey, next);
}

function getRecentTopics(state: SessionState, trackKey: string) {
  return state.recentQuestionTopicsByTrack.get(trackKey) ?? [];
}

function extractKeywords(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5);

  return [...new Set(tokens)].slice(0, 14);
}

function scoreAnswer(answerText: string, canonicalAnswer: string) {
  const cleanAnswer = answerText.trim();
  if (!cleanAnswer) return 0;

  const keywords = extractKeywords(canonicalAnswer);
  if (keywords.length === 0) {
    return Math.min(100, Math.round(cleanAnswer.length / 3));
  }

  const lower = cleanAnswer.toLowerCase();
  const matches = keywords.filter((word) => lower.includes(word)).length;
  const coverageScore = (matches / keywords.length) * 80;
  const lengthBonus = Math.min(20, Math.round(cleanAnswer.length / 40));
  return Math.max(0, Math.min(100, Math.round(coverageScore + lengthBonus)));
}

function feedbackFromScore(score: number) {
  if (score >= 85) return "Strong answer. You covered core concepts with good depth and structure.";
  if (score >= 65) return "Good baseline. Add more explicit trade-offs and edge-case handling.";
  if (score >= 40) return "Partial answer. Some ideas are correct, but important details are missing.";
  return "Answer is shallow/incomplete. Cover fundamentals first, then implementation trade-offs.";
}

function isComparableExpected(expected: string) {
  if (!expected || !expected.trim()) return false;
  return !expected.includes("...");
}

type HarnessResult = {
  stdin: string;
  expected: string;
  passed: boolean;
  note: string;
};

function parseHarnessResults(stdout: string): HarnessResult[] | null {
  const marker = "__RESULT__:";
  const idx = stdout.lastIndexOf(marker);
  if (idx < 0) return null;

  const payload = stdout.slice(idx + marker.length).trim();
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;

    return parsed.map((item) => ({
      stdin: String(item?.stdin ?? ""),
      expected: String(item?.expected ?? ""),
      passed: Boolean(item?.passed),
      note: String(item?.note ?? ""),
    }));
  } catch {
    return null;
  }
}

function buildCodingHarness(source: string, codingSpec: CodingSpec) {
  const marker = "__RESULT__:";
  const testsLiteral = JSON.stringify(codingSpec.tests);
  const functionNameLiteral = JSON.stringify(codingSpec.functionName);

  return `
${source}
(async () => {
  const __tests = ${testsLiteral};
  const __name = ${functionNameLiteral};
  // Resolve function whether declared as function, const, or assigned to global.
  let __target = globalThis[__name];
  if (typeof __target !== "function") {
    try {
      __target = eval(__name);
    } catch (_e) {
      // ignore and keep trying fallbacks
    }
  }
  if (typeof __target !== "function" && typeof module !== "undefined" && module && module.exports) {
    __target = module.exports[__name];
  }
  if (typeof __target !== "function" && typeof exports !== "undefined") {
    __target = exports[__name];
  }
  const __results = [];

  for (const t of __tests) {
    try {
      if (typeof __target !== "function") {
        throw new Error("Function " + __name + " not found");
      }
      const __args = Array.isArray(t.args) ? t.args : [];
      const __actual = await __target(...__args);
      const __expected = t.expected;
      const __passed = JSON.stringify(__actual) === JSON.stringify(__expected);
      __results.push({
        stdin: JSON.stringify(__args),
        expected: JSON.stringify(__expected),
        passed: __passed,
        note: __passed ? "Matches expected output." : "Got: " + JSON.stringify(__actual)
      });
    } catch (e) {
      __results.push({
        stdin: JSON.stringify(Array.isArray(t.args) ? t.args : []),
        expected: JSON.stringify(t.expected),
        passed: false,
        note: e && e.message ? e.message : String(e)
      });
    }
  }

  console.log("${marker}" + JSON.stringify(__results));
})().catch((e) => {
  console.log("${marker}" + JSON.stringify([{stdin:"", expected:"", passed:false, note: e && e.message ? e.message : String(e)}]));
});
`;
}

function outputMatchesExpected(stdout: string, expected: string) {
  const out = normalizeText(stdout);
  const exp = normalizeText(expected);
  if (!out || !exp) return false;
  return out === exp || out.includes(exp);
}

function extractJsonObject(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("Model response did not contain a JSON object.");
  }
  return text.slice(first, last + 1);
}

function ensureArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isValidIdentifier(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function stripReferenceNoise(text: string) {
  return text
    .replace(/use this context when relevant:\s*[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/(?:auto[- ]?synced|synced)\s+(?:pdf|web)[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/(?:reference\s+material|reference\s+source|source\s+document)[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/calibrate depth for[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/include\s+one\s+concrete\s+example[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/keep\s+your\s+explanation\s+concise[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/core\s+focus:\s*[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/focus\s+on\s+practical\s+frontend\s+execution\s+details\.?/gi, " ")
    .replace(/\bcontext:\s*[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/implementation trade-?offs and reliable delivery choices\.?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function coerceGeneratedPayload(raw: unknown, preferredType: QuestionType): GeneratedQuestionPayload {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const type = obj.type === "coding" || obj.type === "theory" ? (obj.type as QuestionType) : preferredType;
  const hints = ensureArray(obj.hints)
    .map((item) => stripReferenceNoise(String(item)))
    .filter((item) => item.length > 0 && !/(auto[- ]?synced|pdf|experienceleague|reference\s+material)/i.test(item))
    .slice(0, 6);

  const payload: GeneratedQuestionPayload = {
    title: stripReferenceNoise(String(obj.title ?? "Interview Question")).trim() || "Interview Question",
    type,
    questionText: stripReferenceNoise(String(obj.questionText ?? "").trim()),
    hints,
    canonicalAnswer: stripReferenceNoise(String(obj.canonicalAnswer ?? "").trim()),
    referenceSolution: obj.referenceSolution ? String(obj.referenceSolution) : undefined,
  };

  if (type === "coding") {
    const specRaw = (obj.codingSpec ?? {}) as Record<string, unknown>;
    const testsRaw = ensureArray(specRaw.tests);

    const tests: CodingTestCase[] = testsRaw
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({
        description: item.description ? String(item.description) : undefined,
        args: Array.isArray(item.args) ? item.args : [],
        expected: item.expected,
      }))
      .filter((test) => test.args.length > 0 || test.expected !== undefined)
      .slice(0, 6);

    const functionName = String(specRaw.functionName ?? "").trim();

    if (functionName && isValidIdentifier(functionName) && tests.length >= 2) {
      payload.codingSpec = { functionName, tests };
    }
  }

  return payload;
}

function pickOne<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickNovelTopic(topicHints: string[], recentTopics: string[]) {
  const available = topicHints.filter((topic) => !isRepeatedTopic(topic, recentTopics));
  const pool = available.length > 0 ? available : topicHints;
  return pickOne(pool);
}

function detectQuestionTopic(question: InterviewQuestion, topicHints: string[]) {
  const haystack = normalizeTopic(`${question.title} ${question.questionText} ${(question.hints ?? []).join(" ")}`);
  if (!haystack) return undefined;

  const sortedHints = [...topicHints].sort((a, b) => b.length - a.length);
  for (const topic of sortedHints) {
    const normalized = normalizeTopic(topic);
    if (!normalized) continue;
    if (haystack.includes(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

type SkillTrack =
  | "javascript"
  | "react"
  | "preact"
  | "system_design"
  | "adobe_eds"
  | "adobe_dropins"
  | "general";

function detectSkillTrack(skills: string[]): SkillTrack {
  const joined = skills.join(" ").toLowerCase();
  if (joined.includes("drop")) return "adobe_dropins";
  if (joined.includes("eds")) return "adobe_eds";
  if (joined.includes("system design")) return "system_design";
  if (joined.includes("preact")) return "preact";
  if (joined.includes("react")) return "react";
  if (joined.includes("javascript") || joined.includes("js")) return "javascript";
  return "general";
}

const CORE_TOPIC_HINTS_BY_TRACK: Record<SkillTrack, Record<Difficulty, string[]>> = {
  javascript: {
    easy: [
      "var vs let vs const, hoisting, and temporal dead zone",
      "closures and lexical scope",
      "this binding (default, implicit, explicit, arrow function)",
      "== vs === and type coercion rules",
      "prototype chain basics and constructor functions",
      "map/filter/reduce usage and immutability basics",
    ],
    medium: [
      "event loop, call stack, microtasks vs macrotasks",
      "promises vs async/await and error propagation",
      "call/apply/bind with practical use-cases",
      "shallow copy vs deep copy and mutation pitfalls",
      "debounce vs throttle and UI performance trade-offs",
      "ES modules vs CommonJS and module loading behavior",
    ],
    hard: [
      "memory leaks in JavaScript and garbage collection behavior",
      "event delegation trade-offs for large DOM trees",
      "building robust polyfills and spec edge cases",
      "stale closures and async race-condition handling",
      "performance profiling and bottleneck isolation in JS-heavy flows",
      "advanced prototype/descriptor behavior and property lookup costs",
    ],
  },
  react: {
    easy: [
      "props vs state and one-way data flow",
      "useState/useEffect fundamentals and common mistakes",
      "controlled vs uncontrolled form components",
      "keys in list rendering and reconciliation basics",
      "component composition vs inheritance in React",
      "React lifecycle mapping to hooks",
    ],
    medium: [
      "useMemo/useCallback/react.memo and when they help",
      "context API vs prop drilling trade-offs",
      "custom hooks design and reusability boundaries",
      "useRef/useLayoutEffect and rendering implications",
      "state colocation vs global state in medium-sized apps",
      "handling async data fetching and stale updates in effects",
    ],
    hard: [
      "render performance profiling and optimization strategy",
      "SSR/hydration mismatch debugging",
      "error boundaries, suspense, and lazy loading trade-offs",
      "state architecture for large React applications",
      "concurrent rendering mental model and StrictMode behaviors",
      "testing strategy for hooks, stateful components, and async UI",
    ],
  },
  preact: {
    easy: ["preact vs react rendering differences", "signals basics and state updates"],
    medium: ["preact performance tuning and bundle-size trade-offs", "interop between preact and react ecosystems"],
    hard: ["preact architecture decisions for high-traffic storefronts", "signals/state orchestration at scale"],
  },
  system_design: {
    easy: ["frontend architecture fundamentals and boundaries"],
    medium: ["caching strategy and failure isolation in frontend platforms"],
    hard: ["multi-team ownership model, observability, and rollout governance"],
  },
  adobe_eds: {
    easy: ["EDS block structure and Drop-ins integration basics"],
    medium: ["Drop-ins extension points, data flow, and deployment strategy"],
    hard: ["EDS platform governance, release safety, and multistore complexity"],
  },
  adobe_dropins: {
    easy: ["Drop-ins setup and rendering container fundamentals"],
    medium: ["Drop-ins customization boundaries and integration patterns"],
    hard: ["Drop-ins architecture trade-offs, ownership boundaries, and reliability"],
  },
  general: {
    easy: ["frontend fundamentals and implementation correctness"],
    medium: ["frontend trade-offs and scalability"],
    hard: ["frontend architecture and operational excellence"],
  },
};

function getCoreTopicHints(skillTrack: SkillTrack, difficulty: Difficulty) {
  return CORE_TOPIC_HINTS_BY_TRACK[skillTrack]?.[difficulty] ?? CORE_TOPIC_HINTS_BY_TRACK.general[difficulty];
}

function isWeakTheoryAnswer(answer: string) {
  const text = normalizeText(answer);
  if (!text || text.length < 80) return true;
  return (
    text.includes("a strong answer") ||
    text.includes("should include") ||
    text.includes("should clearly define") ||
    text.includes("demonstrates it with a practical example")
  );
}

function buildConcreteTheoryAnswer(input: {
  topic: string;
  skillTrack: SkillTrack;
  includeCommerceFlavor: boolean;
}) {
  const topic = normalizeText(input.topic);

  if (topic.includes("this binding")) {
    return "In JavaScript, `this` depends on call-site: default binding is global object (or `undefined` in strict mode), implicit binding is the object before the dot (`obj.fn()`), explicit binding uses `call/apply/bind`, and `new` binds `this` to the new instance. Arrow functions do not bind their own `this`; they capture lexical `this` from outer scope. Example: inside a class callback, arrow methods avoid losing instance context. Common pitfall: passing unbound methods as callbacks causes `this` to become `undefined`/global. Trade-off: arrow functions improve correctness for callbacks but can reduce flexibility when dynamic rebinding is needed.";
  }

  if (topic.includes("closure")) {
    return "A closure is a function that retains access to variables from its lexical scope even after the outer function returns. Example: a factory function returns an incrementer that keeps private `count`. Common pitfall: stale closures in async/UI handlers capturing outdated state. Trade-off: closures are excellent for encapsulation and memoization, but can accidentally retain memory if long-lived references are not cleaned up.";
  }

  if (topic.includes("hoisting") || topic.includes("temporal dead zone") || topic.includes("var vs let vs const")) {
    return "`var` is function-scoped and hoisted with initial value `undefined`; `let` and `const` are block-scoped and hoisted into the Temporal Dead Zone (TDZ), so access before declaration throws. `const` prevents rebinding but not deep mutation of objects. Example: reading a `let` variable before declaration triggers ReferenceError, while `var` returns `undefined`. Pitfall: mixing `var` in loops creates shared binding bugs. Trade-off: `let/const` improve safety and readability with minimal runtime cost.";
  }

  if (topic.includes("event loop") || topic.includes("microtasks") || topic.includes("macrotasks")) {
    return "JavaScript runs on a single call stack; async work is queued and processed by the event loop. Microtasks (Promise callbacks, `queueMicrotask`) run before the next macrotask (timers, I/O events). Example: `Promise.resolve().then(...)` executes before `setTimeout(..., 0)`. Pitfall: long microtask chains can starve rendering/input responsiveness. Trade-off: microtasks are great for predictable post-sync work, but heavy logic should be chunked to keep UI responsive.";
  }

  if (topic.includes("promise") || topic.includes("async/await")) {
    return "`async/await` is syntax over Promises: `await` pauses inside async function until promise settles. Use `try/catch` for rejection handling; use `Promise.all` for parallel operations when all are required. Example: fetch profile and permissions in parallel, then render once both resolve. Pitfall: awaiting sequentially when tasks are independent adds latency. Trade-off: `async/await` improves readability, while raw Promise composition can be more flexible for advanced concurrency flows.";
  }

  if (topic.includes("props vs state")) {
    return "Props are read-only inputs from parent; state is mutable local data owned by the component. Use props for configuration/data flow and state for UI that changes over time (form input, toggles, local cache). Example: product card receives `price` as prop but tracks expanded/collapsed state locally. Pitfall: duplicating props into state causes stale UI and sync bugs. Trade-off: strict ownership keeps components predictable, but can require lifting state up for shared interactions.";
  }

  if (topic.includes("useeffect")) {
    return "`useEffect` runs side effects after render; dependencies control when effect re-runs. Always include referenced reactive values in dependency array or intentionally document why not. Example: fetch data when `productId` changes and abort previous request on cleanup. Pitfall: missing dependencies causes stale reads; unnecessary dependencies can create loops. Trade-off: effects enable integration with external systems, but overusing them for derived state increases complexity.";
  }

  if (topic.includes("usememo") || topic.includes("usecallback") || topic.includes("react.memo")) {
    return "`useMemo` memoizes computed values, `useCallback` memoizes function references, and `React.memo` skips child re-render when props are shallow-equal. Use them where profiling shows expensive re-renders, not everywhere. Example: memoize filtered list passed to memoized child table. Pitfall: over-memoization adds cognitive overhead and can hurt performance if dependencies churn. Trade-off: targeted memoization improves hot paths; blanket memoization reduces maintainability.";
  }

  if (topic.includes("reconciliation") || topic.includes("keys")) {
    return "React reconciliation compares previous and next virtual trees to update only changed nodes. Stable `key` values let React preserve component identity in lists. Example: use database IDs as keys so item state is retained during reorder. Pitfall: using array index as key can remount wrong items and lose local state. Trade-off: stable keys improve correctness and performance but require reliable identity from data layer.";
  }

  if (topic.includes("context")) {
    return "Context shares values across component tree without prop drilling. Use it for truly cross-cutting concerns (theme, auth session, locale), not rapidly changing local state. Example: AuthContext provides user/session, while feature-specific form state stays local. Pitfall: large context objects that update frequently can trigger broad re-renders. Trade-off: context simplifies wiring but should be split by concern and combined with memoization/selectors for performance.";
  }

  if (topic.includes("controlled vs uncontrolled")) {
    return "Controlled inputs store value in React state and update via `onChange`; uncontrolled inputs keep state in DOM and are read via refs. Controlled mode gives validation/composition control; uncontrolled can be simpler for small forms or large legacy integrations. Pitfall: switching between controlled/uncontrolled causes warnings and inconsistent behavior. Trade-off: controlled forms are predictable but create more rerenders/boilerplate.";
  }

  if (input.skillTrack === "react") {
    return "A solid React answer should define the core concept, show a minimal component example, explain one realistic bug pattern, and describe the performance/maintainability trade-off. Prioritize clear state ownership, predictable renders, and explicit side-effect boundaries.";
  }

  if (input.skillTrack === "javascript") {
    return "A solid JavaScript answer should define the runtime/language behavior, include one short code example, explain an edge case that often breaks production code, and discuss the readability-vs-performance trade-off for the chosen pattern.";
  }

  const commerceNote = input.includeCommerceFlavor
    ? " In Adobe Commerce Drop-ins/EDS scenarios, map the concept to integration boundaries and predictable component behavior."
    : "";

  return `Define the concept precisely, walk through one concrete example, call out a common failure case, and explain a practical trade-off relevant to frontend production systems.${commerceNote}`;
}

function buildEmergencyDynamicQuestion(input: {
  difficulty: Difficulty;
  preferredType: QuestionType;
  roleContext: RoleContext;
  skills: string[];
  mustIncludeEds: boolean;
  topicHints?: string[];
  avoidTopics?: string[];
}): GeneratedQuestionPayload {
  const normalizedSkills = input.skills.map((skill) => skill.toLowerCase());
  const skillTrack = detectSkillTrack(input.skills);
  const topicHints = input.topicHints && input.topicHints.length > 0
    ? input.topicHints
    : getCoreTopicHints(skillTrack, input.difficulty);
  const selectedCoreTopic = pickNovelTopic(topicHints, input.avoidTopics ?? []);
  const primarySkill = input.skills[0] ?? "Frontend";
  const effectiveType: QuestionType = skillTrack === "system_design" ? "theory" : input.preferredType;
  const includeCommerceFlavor =
    input.mustIncludeEds ||
    normalizedSkills.some((skill) => skill.includes("adobe") || skill.includes("commerce") || skill.includes("drop"));

  if (effectiveType === "coding") {
    const codingVariantsByTrack: Record<SkillTrack, Array<{
      title: string;
      questionText: string;
      canonicalAnswer: string;
      referenceSolution: string;
      codingSpec: CodingSpec;
    }>> = {
      javascript: [
        {
          title: "String Utility: Build Slug",
          questionText:
            "Implement buildSlug(input) to return a lowercase dash-separated slug by removing punctuation and collapsing separators.",
          canonicalAnswer:
            "Lowercase, trim, remove non-word separators, collapse repeated whitespace/dashes, and return deterministic output.",
          referenceSolution:
            "function buildSlug(input) {\n  return String(input ?? '')\n    .toLowerCase()\n    .trim()\n    .replace(/[^\\w\\s-]/g, '')\n    .replace(/\\s+/g, '-')\n    .replace(/-+/g, '-');\n}",
          codingSpec: {
            functionName: "buildSlug",
            tests: [
              { args: ["  Hello World!  "], expected: "hello-world" },
              { args: ["React Performance"], expected: "react-performance" },
            ],
          },
        },
        {
          title: "Collection Utility: Count Values",
          questionText:
            "Implement countFrequencies(items) to return an object mapping normalized string values to counts.",
          canonicalAnswer: "Normalize each value (trim + lowercase), skip empties, and count deterministically.",
          referenceSolution:
            "function countFrequencies(items) {\n  const out = {};\n  for (const item of items) {\n    const key = String(item ?? '').trim().toLowerCase();\n    if (!key) continue;\n    out[key] = (out[key] ?? 0) + 1;\n  }\n  return out;\n}",
          codingSpec: {
            functionName: "countFrequencies",
            tests: [
              { args: [[" A ", "a", "B"]], expected: { a: 2, b: 1 } },
              { args: [[null, " ", "x"]], expected: { x: 1 } },
            ],
          },
        },
        {
          title: "Array Utility: Flatten One Level",
          questionText:
            "Implement flattenOneLevel(arr) that flattens one nesting level from an array and preserves element order.",
          canonicalAnswer:
            "Iterate through items, spread nested arrays by one level only, and keep non-array values unchanged in order.",
          referenceSolution:
            "function flattenOneLevel(arr) {\n  const out = [];\n  for (const item of arr) {\n    if (Array.isArray(item)) out.push(...item);\n    else out.push(item);\n  }\n  return out;\n}",
          codingSpec: {
            functionName: "flattenOneLevel",
            tests: [
              { args: [[1, [2, 3], 4]], expected: [1, 2, 3, 4] },
              { args: [[[1], [2], 3]], expected: [1, 2, 3] },
            ],
          },
        },
        {
          title: "Object Utility: Get Nested Value",
          questionText:
            "Implement getNestedValue(obj, path, fallback) where path is dot-separated (e.g. 'a.b.c') and return fallback if missing.",
          canonicalAnswer:
            "Split path by dots, traverse safely, and return fallback when a segment is missing or nullish.",
          referenceSolution:
            "function getNestedValue(obj, path, fallback) {\n  const parts = String(path ?? '').split('.').filter(Boolean);\n  let cur = obj;\n  for (const part of parts) {\n    if (cur == null || !(part in cur)) return fallback;\n    cur = cur[part];\n  }\n  return cur === undefined ? fallback : cur;\n}",
          codingSpec: {
            functionName: "getNestedValue",
            tests: [
              { args: [{ a: { b: { c: 5 } } }, "a.b.c", null], expected: 5 },
              { args: [{ a: {} }, "a.b.c", "NA"], expected: "NA" },
            ],
          },
        },
      ],
      react: [
        {
          title: "React Data Utility: Build View Model",
          questionText:
            "Implement buildProductViewModel(products, query) to filter by case-insensitive query, sort by name, and return {id,name} objects.",
          canonicalAnswer:
            "Filter with normalized query, sort in deterministic order, and return minimal shape consumed by UI.",
          referenceSolution:
            "function buildProductViewModel(products, query) {\n  const q = String(query ?? '').trim().toLowerCase();\n  return products\n    .filter((p) => {\n      if (!q) return true;\n      return String(p?.name ?? '').toLowerCase().includes(q);\n    })\n    .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')))\n    .map((p) => ({ id: p.id, name: p.name }));\n}",
          codingSpec: {
            functionName: "buildProductViewModel",
            tests: [
              {
                args: [[{ id: 2, name: "Beta" }, { id: 1, name: "Alpha" }], ""],
                expected: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
              },
              {
                args: [[{ id: 1, name: "Cart" }, { id: 2, name: "Checkout" }], "car"],
                expected: [{ id: 1, name: "Cart" }],
              },
            ],
          },
        },
        {
          title: "React Reducer Utility",
          questionText:
            "Implement applyCounterAction(state, action) for a reducer supporting {type:'inc'}, {type:'dec'}, and {type:'reset', value:number}.",
          canonicalAnswer:
            "Return a new state object, handle known action types deterministically, and default to unchanged state for unknown actions.",
          referenceSolution:
            "function applyCounterAction(state, action) {\n  const current = Number(state?.count ?? 0);\n  if (action?.type === 'inc') return { count: current + 1 };\n  if (action?.type === 'dec') return { count: current - 1 };\n  if (action?.type === 'reset') return { count: Number(action?.value ?? 0) };\n  return { count: current };\n}",
          codingSpec: {
            functionName: "applyCounterAction",
            tests: [
              { args: [{ count: 1 }, { type: "inc" }], expected: { count: 2 } },
              { args: [{ count: 4 }, { type: "reset", value: 0 }], expected: { count: 0 } },
            ],
          },
        },
        {
          title: "React Selection Reconciler",
          questionText:
            "Implement reconcileSelection(selectedIds, nextItems) to keep only selected ids that still exist in nextItems.",
          canonicalAnswer:
            "Build a set of valid ids from nextItems and filter selectedIds against it while preserving original order.",
          referenceSolution:
            "function reconcileSelection(selectedIds, nextItems) {\n  const valid = new Set(nextItems.map((item) => item.id));\n  return selectedIds.filter((id) => valid.has(id));\n}",
          codingSpec: {
            functionName: "reconcileSelection",
            tests: [
              { args: [[1, 2, 3], [{ id: 2 }, { id: 3 }, { id: 4 }]], expected: [2, 3] },
              { args: [[7, 8], [{ id: 1 }]], expected: [] },
            ],
          },
        },
      ],
      preact: [
        {
          title: "Preact Utility: Derive Visible Items",
          questionText:
            "Implement deriveVisibleItems(items, selectedCategory) to return items in selected category, sorted by priority descending.",
          canonicalAnswer:
            "Filter by selected category, then sort by numeric priority descending for predictable rendering order.",
          referenceSolution:
            "function deriveVisibleItems(items, selectedCategory) {\n  return items\n    .filter((item) => String(item?.category ?? '') === String(selectedCategory ?? ''))\n    .sort((a, b) => Number(b?.priority ?? 0) - Number(a?.priority ?? 0));\n}",
          codingSpec: {
            functionName: "deriveVisibleItems",
            tests: [
              {
                args: [[{ category: "a", priority: 1 }, { category: "a", priority: 3 }, { category: "b", priority: 2 }], "a"],
                expected: [{ category: "a", priority: 3 }, { category: "a", priority: 1 }],
              },
              { args: [[{ category: "x", priority: 2 }], "y"], expected: [] },
            ],
          },
        },
      ],
      adobe_eds: [
        {
          title: "EDS Utility: Normalize Content Blocks",
          questionText:
            "Implement normalizeEdsBlocks(blocks) to keep only enabled blocks, trim ids, and return unique blocks by id.",
          canonicalAnswer:
            "Filter enabled blocks, normalize ids, and deduplicate by id while preserving deterministic ordering.",
          referenceSolution:
            "function normalizeEdsBlocks(blocks) {\n  const seen = new Set();\n  const out = [];\n  for (const block of blocks) {\n    if (!block?.enabled) continue;\n    const id = String(block?.id ?? '').trim();\n    if (!id || seen.has(id)) continue;\n    seen.add(id);\n    out.push({ ...block, id });\n  }\n  return out;\n}",
          codingSpec: {
            functionName: "normalizeEdsBlocks",
            tests: [
              {
                args: [[{ id: " hero ", enabled: true }, { id: "hero", enabled: true }, { id: "x", enabled: false }]],
                expected: [{ id: "hero", enabled: true }],
              },
              { args: [[{ id: "", enabled: true }, { id: "a", enabled: true }]], expected: [{ id: "a", enabled: true }] },
            ],
          },
        },
      ],
      adobe_dropins: [
        {
          title: "Drop-ins Utility: Merge Cart Lines",
          questionText:
            "Implement mergeDropinCartLines(lines) that aggregates quantities by SKU and returns sorted output by SKU.",
          canonicalAnswer: "Aggregate by SKU in a map, sum quantities, and return a stable sorted array.",
          referenceSolution:
            "function mergeDropinCartLines(lines) {\n  const m = new Map();\n  for (const line of lines) {\n    const sku = String(line?.sku ?? '').trim();\n    if (!sku) continue;\n    const qty = Number(line?.qty ?? 0) || 0;\n    m.set(sku, (m.get(sku) ?? 0) + qty);\n  }\n  return [...m.entries()].map(([sku, qty]) => ({ sku, qty })).sort((a, b) => a.sku.localeCompare(b.sku));\n}",
          codingSpec: {
            functionName: "mergeDropinCartLines",
            tests: [
              {
                args: [[{ sku: "A", qty: 1 }, { sku: "A", qty: 2 }, { sku: "B", qty: 4 }]],
                expected: [{ sku: "A", qty: 3 }, { sku: "B", qty: 4 }],
              },
              { args: [[{ sku: " ", qty: 9 }, { sku: "C", qty: 1 }]], expected: [{ sku: "C", qty: 1 }] },
            ],
          },
        },
      ],
      system_design: [],
      general: [
        {
          title: "Collection Utility: Build Facet Counts",
          questionText:
            "Implement buildFacetCounts(values) that returns an object with lowercase trimmed keys and occurrence counts.",
          canonicalAnswer:
            "Normalize values by trim+lowercase, skip empty strings, then count occurrences in a plain object.",
          referenceSolution:
            "function buildFacetCounts(values) {\n  const out = {};\n  for (const raw of values) {\n    const key = String(raw ?? '').trim().toLowerCase();\n    if (!key) continue;\n    out[key] = (out[key] ?? 0) + 1;\n  }\n  return out;\n}",
          codingSpec: {
            functionName: "buildFacetCounts",
            tests: [
              { args: [[" Size ", "size", "COLOR", "color", ""]], expected: { size: 2, color: 2 } },
              { args: [[null, " material ", "MATERIAL"]], expected: { material: 2 } },
            ],
          },
        },
      ],
    };

    const codingVariants =
      codingVariantsByTrack[skillTrack].length > 0
        ? codingVariantsByTrack[skillTrack]
        : codingVariantsByTrack.general;

    const selected = pickOne([...codingVariants]);
    const experienceHint = `Calibrate complexity for approximately ${input.roleContext.yearsExperience} years of experience.`;
    const skillHint = `Focus area: ${primarySkill}.`;
    const edsHint = includeCommerceFlavor
      ? "When relevant, keep Adobe Commerce Drop-ins and Preact implementation constraints in mind."
      : "Keep implementation production-minded and deterministic.";

    return {
      title: selected.title,
      type: "coding",
      questionText: selected.questionText,
      hints: [experienceHint, skillHint, `Core focus: ${selectedCoreTopic}.`, edsHint],
      canonicalAnswer: selected.canonicalAnswer,
      referenceSolution: selected.referenceSolution,
      codingSpec: selected.codingSpec,
    };
  }

  const domainByTrack: Record<SkillTrack, string> = {
    javascript: "JavaScript language fundamentals and runtime behavior",
    react: "React component boundaries, rendering behavior, and state flow",
    preact: "Preact component patterns and lightweight storefront integration",
    system_design: "frontend system design and architecture decisions",
    adobe_eds: "Adobe Commerce EDS implementation strategy using Drop-ins and Preact",
    adobe_dropins: "Adobe Commerce Drop-ins integration strategy with Preact storefront patterns",
    general: "frontend implementation and architecture trade-offs",
  };

  const edsNudge = includeCommerceFlavor
    ? "Include concrete Drop-ins + Preact decisions where relevant."
    : "Focus on practical frontend execution details.";

  return {
    title: `${primarySkill}: ${selectedCoreTopic}`,
    type: "theory",
    questionText: `Explain ${selectedCoreTopic} in the context of ${domainByTrack[skillTrack]}.`,
    hints: [
      "Keep your explanation concise, practical, and implementation-oriented.",
      `Core focus: ${selectedCoreTopic}.`,
      edsNudge,
    ],
    canonicalAnswer: buildConcreteTheoryAnswer({
      topic: selectedCoreTopic,
      skillTrack,
      includeCommerceFlavor,
    }),
  };
}

async function generateQuestionWithLLM(input: {
  difficulty: Difficulty;
  preferredType: QuestionType;
  roleContext: RoleContext;
  skills: string[];
  focusSkill?: string;
  topicHints: string[];
  recentTopics: string[];
  mustIncludeEds: boolean;
  recentSignatures: string[];
  resourceContext: string[];
}) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const model = (process.env.QUESTION_GEN_MODEL || "gpt-4o-mini").trim();

  const system = [
    "You generate interview questions for frontend roles.",
    "Output ONLY valid JSON, no markdown.",
    "Never include role names in question text.",
    "Never append skill-stack lists in parentheses.",
    "Never mention synced resources, references, PDFs, or source context in question text or hints.",
    "Question must be NEW and not semantically similar to recent signatures.",
    "Do not reuse any topic listed in recentCoreTopicsToAvoid.",
    "For JavaScript/React focus, prioritize core fundamentals over generic architecture prompts.",
    "When focusSkill is JavaScript or React, select one topic from topicHints and make it the main question focus.",
    "If type is coding, use a single pure function task (no classes, no async, no DOM) so automated tests can run.",
    "If Adobe Commerce/EDS is relevant, include Drop-ins and Preact expectations explicitly.",
    "Respect requested difficulty exactly.",
  ].join(" ");

  const userPayload = {
    freshnessSeed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    difficulty: input.difficulty,
    preferredType: input.preferredType,
    roleBand: input.roleContext.roleBand,
    yearsExperience: input.roleContext.yearsExperience,
    focusSkill: input.focusSkill ?? null,
    topicHints: input.topicHints,
    recentCoreTopicsToAvoid: input.recentTopics,
    skills: input.skills,
    mustIncludeEds: input.mustIncludeEds,
    recentQuestionSignaturesToAvoid: input.recentSignatures,
    referenceContext: input.resourceContext,
    requiredSchema: {
      title: "string",
      type: "'theory' | 'coding'",
      questionText: "string",
      hints: ["string", "string"],
      canonicalAnswer: "string",
      referenceSolution: "string (required if coding)",
      codingSpec: {
        functionName: "string (required if coding)",
        tests: [
          {
            description: "string",
            args: ["json serializable arguments"],
            expected: "json serializable expected value"
          }
        ]
      }
    }
  };

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      temperature: 0.95,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part: any) => String(part?.text ?? "")).join("\n")
    : String(content ?? "");

  const parsed = JSON.parse(extractJsonObject(text));
  return coerceGeneratedPayload(parsed, input.preferredType);
}

function questionPayloadToInterviewQuestion(payload: GeneratedQuestionPayload, opts: {
  mustIncludeEds: boolean;
}): InterviewQuestion {
  const codingSpec = payload.type === "coding" ? payload.codingSpec : undefined;
  const tests = codingSpec
    ? codingSpec.tests.map((test) => ({
        stdin: JSON.stringify(test.args),
        expected: JSON.stringify(test.expected),
      }))
    : [];

  const canonicalAnswer = opts.mustIncludeEds
    ? `${payload.canonicalAnswer} Ensure practical Adobe Commerce Drop-ins and Preact integration details are covered where relevant.`
    : payload.canonicalAnswer;

  return {
    questionId: buildQuestionId(),
    templateId: `dyn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: payload.title,
    questionText: payload.questionText,
    type: payload.type,
    hints: payload.hints,
    canonicalAnswer,
    referenceSolution: payload.referenceSolution,
    tests,
    codingSpec,
  };
}

export class InterviewAgent {
  private readonly stateBySession = new Map<string, SessionState>();

  constructor(_opts: Constructor = {}) {}

  async call({ input }: AgentCallRequest): Promise<AgentCallResponse> {
    const action = input?.action;
    if (action === "next_question") {
      return { output: await this.nextQuestionHandler(input ?? {}) };
    }
    if (action === "evaluate_answer") {
      return { output: await this.evaluateAnswerHandler(input ?? {}) };
    }
    return { output: { message: "Send action: next_question or evaluate_answer" } };
  }

  private getSessionState(sessionId: string, profile?: SessionProfile) {
    const existing = this.stateBySession.get(sessionId);
    if (existing) {
      if (profile) existing.profile = profile;
      return existing;
    }

    const created: SessionState = {
      profile,
      questions: new Map(),
      evaluations: new Map(),
      recentQuestionSignaturesByTrack: new Map(),
      recentQuestionTopicsByTrack: new Map(),
    };

    this.stateBySession.set(sessionId, created);
    return created;
  }

  private async nextQuestionHandler(input: AgentInput): Promise<InterviewQuestion> {
    const sessionId = input.sessionId ?? "default";
    const difficulty = toDifficulty(input.level);
    const state = this.getSessionState(sessionId, input.profile);
    const roleContext = resolveRoleContext(state.profile);
    const preferredType = choosePreferredQuestionType(difficulty, roleContext.yearsExperience);
    const activeSkillRaw = typeof state.profile?.activeSkill === "string" ? state.profile.activeSkill.trim() : "";
    const activeSkill = activeSkillRaw || undefined;
    const allSkills = (state.profile?.skills ?? []).map((skill) => String(skill)).filter(Boolean);
    const skills = activeSkill ? [activeSkill] : allSkills;
    const skillTrack = detectSkillTrack(skills);
    const allTopicHints = getCoreTopicHints(skillTrack, difficulty);
    const trackKey = buildTrackKey(difficulty, roleContext, activeSkill);
    const recentSignatures = getRecentSignatures(state, trackKey);
    const recentTopics = getRecentTopics(state, trackKey);
    const randomizedTopicHints = shuffled(allTopicHints);
    const topicHints = randomizedTopicHints.filter((topic) => !isRepeatedTopic(topic, recentTopics));
    const effectiveTopicHints = topicHints.length > 0 ? topicHints : randomizedTopicHints;
    const mustIncludeEds = skills.some((skill) => skill.toLowerCase().includes("adobe") || skill.toLowerCase().includes("eds"));

    const referenceHits = retrieveReferenceHits({
      query: [
        difficulty,
        roleContext.roleBand,
        String(roleContext.yearsExperience),
        ...skills,
        ...effectiveTopicHints.slice(0, 4),
        "core fundamentals interview questions",
      ].join(" "),
      topK: 3,
    });

    const resourceContext = referenceHits.map((hit) => `${hit.title}: ${hit.excerpt}`);

    const typeAttempts: QuestionType[] = [
      preferredType,
      preferredType === "coding" ? "theory" : "coding",
      preferredType,
      preferredType === "coding" ? "theory" : "coding",
    ];

    let selectedQuestion: InterviewQuestion | undefined;
    let selectedSignature = "";
    let selectedTopic: string | undefined;

    for (const attemptType of typeAttempts) {
      try {
        const payload = await generateQuestionWithLLM({
          difficulty,
          preferredType: attemptType,
          roleContext,
          skills,
          focusSkill: activeSkill,
          topicHints: effectiveTopicHints,
          recentTopics,
          mustIncludeEds,
          recentSignatures,
          resourceContext,
        });

        if (!payload.questionText || !payload.canonicalAnswer) {
          continue;
        }

        const candidate = questionPayloadToInterviewQuestion(payload, { mustIncludeEds });
        if (candidate.type === "theory" && isWeakTheoryAnswer(candidate.canonicalAnswer)) {
          candidate.canonicalAnswer = buildConcreteTheoryAnswer({
            topic: `${candidate.title}. ${candidate.questionText}`,
            skillTrack,
            includeCommerceFlavor: mustIncludeEds,
          });
        }
        const candidateSignature = signatureForQuestion(candidate.title, candidate.questionText);
        const candidateTopic =
          detectQuestionTopic(candidate, allTopicHints) ??
          normalizeTopic(candidate.title);

        if (isRepeatedSignature(candidateSignature, recentSignatures)) {
          continue;
        }
        if (candidateTopic && isRepeatedTopic(candidateTopic, recentTopics)) {
          continue;
        }

        selectedQuestion = candidate;
        selectedSignature = candidateSignature;
        selectedTopic = candidateTopic;
        break;
      } catch {
        // Continue attempts and fall back only after retries.
      }
    }

    if (!selectedQuestion) {
      for (let fallbackAttempt = 0; fallbackAttempt < 8; fallbackAttempt += 1) {
        const fallbackPayload = buildEmergencyDynamicQuestion({
          difficulty,
          preferredType,
          roleContext,
          skills,
          mustIncludeEds,
          topicHints: effectiveTopicHints,
          avoidTopics: recentTopics,
        });
        const candidate = questionPayloadToInterviewQuestion(fallbackPayload, { mustIncludeEds });
        if (candidate.type === "theory" && isWeakTheoryAnswer(candidate.canonicalAnswer)) {
          candidate.canonicalAnswer = buildConcreteTheoryAnswer({
            topic: `${candidate.title}. ${candidate.questionText}`,
            skillTrack,
            includeCommerceFlavor: mustIncludeEds,
          });
        }

        const candidateSignature = signatureForQuestion(candidate.title, candidate.questionText);
        const candidateTopic =
          detectQuestionTopic(candidate, allTopicHints) ??
          normalizeTopic(candidate.title);

        if (isRepeatedSignature(candidateSignature, recentSignatures)) {
          continue;
        }
        if (candidateTopic && isRepeatedTopic(candidateTopic, recentTopics)) {
          continue;
        }

        selectedQuestion = candidate;
        selectedSignature = candidateSignature;
        selectedTopic = candidateTopic;
        break;
      }

      if (!selectedQuestion) {
        const fallbackPayload = buildEmergencyDynamicQuestion({
          difficulty,
          preferredType,
          roleContext,
          skills,
          mustIncludeEds,
          topicHints: effectiveTopicHints,
          avoidTopics: recentTopics,
        });
        selectedQuestion = questionPayloadToInterviewQuestion(fallbackPayload, { mustIncludeEds });
        if (selectedQuestion.type === "theory" && isWeakTheoryAnswer(selectedQuestion.canonicalAnswer)) {
          selectedQuestion.canonicalAnswer = buildConcreteTheoryAnswer({
            topic: `${selectedQuestion.title}. ${selectedQuestion.questionText}`,
            skillTrack,
            includeCommerceFlavor: mustIncludeEds,
          });
        }
        selectedSignature = signatureForQuestion(selectedQuestion.title, selectedQuestion.questionText);
        selectedTopic =
          detectQuestionTopic(selectedQuestion, allTopicHints) ??
          normalizeTopic(selectedQuestion.title);
      }
    }

    state.questions.set(selectedQuestion.questionId, selectedQuestion);
    rememberSignature(state, trackKey, selectedSignature);
    if (selectedTopic) {
      rememberTopic(state, trackKey, selectedTopic);
    }
    return selectedQuestion;
  }

  private async evaluateAnswerHandler(input: AgentInput): Promise<EvaluationResult> {
    const sessionId = input.sessionId ?? "default";
    const state = this.getSessionState(sessionId);
    const questionId = input.questionId ?? "";
    const answerText = input.answerText ?? "";
    const question = questionId ? state.questions.get(questionId) : undefined;

    const canonical = question?.canonicalAnswer ?? "No canonical answer was available for this question.";

    if (question?.type === "coding") {
      const harnessSource = question.codingSpec
        ? buildCodingHarness(answerText, question.codingSpec)
        : answerText;

      const run: any = await runCode({
        language: "javascript",
        source: harnessSource,
        stdin: "",
      });

      const statusId = Number(run?.status?.id ?? 0);
      const accepted = statusId === 3;
      const stdout = typeof run?.stdout === "string" ? run.stdout : "";
      const stderr = typeof run?.stderr === "string" ? run.stderr : "";

      const harnessResults = question.codingSpec ? parseHarnessResults(stdout) : null;

      const testResults =
        harnessResults ??
        (question.tests ?? []).map((test) => {
          const comparable = isComparableExpected(test.expected);
          const passed = accepted && !stderr && (comparable ? outputMatchesExpected(stdout, test.expected) : true);
          return {
            stdin: test.stdin,
            expected: test.expected,
            passed,
            note: passed ? "Output behavior looks correct for this check." : "Output does not match this expected result.",
          };
        });

      const comparableResults = testResults.filter((t) => isComparableExpected(t.expected));
      const comparableCount = comparableResults.length;
      const comparablePassed = comparableResults.filter((t) => t.passed).length;

      let score = accepted ? (stdout ? 88 : 78) : 30;
      if (comparableCount > 0) {
        score = Math.round((comparablePassed / comparableCount) * 100);
      }
      if (stderr) {
        score = Math.min(score, 40);
      }

      const rawCorrection = question.referenceSolution ?? canonical;
      const sameAsSubmitted = normalizeText(rawCorrection) === normalizeText(answerText);
      const correction = sameAsSubmitted && score < 80
        ? `${rawCorrection}\n\nNote: Your submitted code matches the stored solution text, but tests still failed. Check "Coding Checks" to see which expected outputs did not match.`
        : rawCorrection;

      const result: EvaluationResult = {
        score,
        feedback: stderr
          ? "Your code executed with errors. Fix runtime issues first, then verify expected outputs."
          : score >= 85
            ? "Strong coding solution. Execution behavior looks correct."
            : score >= 65
              ? "Good direction. The code runs, but output correctness/edge cases need improvement."
              : "The solution needs improvement in execution correctness or output matching.",
        correction,
        nextSteps: [
          "Keep implementation deterministic and easy to reason about.",
          "Validate with explicit sample calls and expected outputs.",
          "Add edge-case coverage (empty input, invalid shapes, boundary values).",
        ],
        tests: testResults,
      };

      if (questionId) state.evaluations.set(questionId, result);
      return result;
    }

    const score = scoreAnswer(answerText, canonical);
    const result: EvaluationResult = {
      score,
      feedback: feedbackFromScore(score),
      correction: canonical,
      nextSteps: [
        "Lead with a concise high-level approach before implementation details.",
        "Explicitly mention trade-offs and failure/edge-case handling.",
        "Use one concrete example to demonstrate correctness.",
      ],
    };

    if (questionId) state.evaluations.set(questionId, result);
    return result;
  }
}
