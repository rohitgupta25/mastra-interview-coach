import React, { useEffect, useMemo, useState } from "react";
import * as api from "../services/api";
import VoiceControls from "./VoiceControls";
import type { InterviewProfile, QuestionLevel } from "../types/interview";

type InterviewQuestion = {
  questionId: string;
  title: string;
  questionText: string;
  type: "theory" | "coding";
  hints?: string[];
  canonicalAnswer?: string;
  referenceSolution?: string;
};

type FeedbackResult = {
  score?: number;
  feedback?: string;
  correction?: string;
  nextSteps?: string[];
  tests?: Array<{
    stdin: string;
    expected: string;
    passed: boolean;
    note: string;
  }>;
};

type Props = {
  profile: InterviewProfile;
  level: QuestionLevel;
  onBackToProfile?: () => void;
};

function scoreTone(score?: number) {
  if ((score ?? 0) >= 80) return "great";
  if ((score ?? 0) >= 60) return "good";
  if ((score ?? 0) >= 40) return "fair";
  return "weak";
}

export default function InterviewUI({ profile, level, onBackToProfile }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [prefetchedNextQuestion, setPrefetchedNextQuestion] = useState<InterviewQuestion | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [runOutput, setRunOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isCreatingSession, setIsCreatingSession] = useState(true);
  const [isFetchingQuestion, setIsFetchingQuestion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isPreparingNextQuestion, setIsPreparingNextQuestion] = useState(false);

  const profileSignature = useMemo(() => JSON.stringify(profile), [profile]);

  const buildQuestionProfile = () => ({
    ...profile,
    skills: profile.activeSkill ? [profile.activeSkill] : profile.skills,
  });

  const resetTransientState = () => {
    setQuestion(null);
    setPrefetchedNextQuestion(null);
    setFeedback(null);
    setShowAnswerKey(false);
    setAnswerText("");
    setCodeText("");
    setRunOutput("");
    setError("");
  };

  const getQuestion = async () => {
    if (!sessionId) return;
    setIsFetchingQuestion(true);
    setError("");

    try {
      const res = await api.requestQuestion(sessionId, level, buildQuestionProfile());
      if (res.ok) {
        setQuestion(res.question);
        setPrefetchedNextQuestion(null);
        setFeedback(null);
        setShowAnswerKey(false);
        setAnswerText("");
        setCodeText("");
        setRunOutput("");
      } else {
        setError(res.error ?? "Could not fetch question.");
      }
    } catch {
      setError("Question request failed. Please retry.");
    } finally {
      setIsFetchingQuestion(false);
    }
  };

  useEffect(() => {
    let active = true;
    resetTransientState();
    setSessionId(null);
    setIsCreatingSession(true);

    (async () => {
      try {
        const res = await api.createSession(buildQuestionProfile());
        if (active) {
          setSessionId(res.sessionId ?? `s_${Date.now()}`);
        }
      } catch {
        if (active) {
          setError("Could not create session. Check if the server is running on port 4000.");
        }
      } finally {
        if (active) {
          setIsCreatingSession(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [profileSignature]);

  useEffect(() => {
    if (!sessionId) return;
    void getQuestion();
  }, [sessionId, level]);

  const submitAnswer = async (text?: string) => {
    if (!sessionId || !question) return;
    const evaluationText = text ?? (question.type === "coding" ? codeText : answerText);
    if (!evaluationText.trim()) return;
    setIsSubmitting(true);
    setError("");

    try {
      const res = await api.submitAnswer(sessionId, question.questionId, evaluationText);
      if (res.ok) {
        setFeedback(res.result);
        setShowAnswerKey(false);
        setIsPreparingNextQuestion(true);
        try {
          const nextRes = await api.requestQuestion(sessionId, level, buildQuestionProfile());
          if (nextRes.ok) {
            setPrefetchedNextQuestion(nextRes.question);
          } else {
            setPrefetchedNextQuestion(null);
          }
        } finally {
          setIsPreparingNextQuestion(false);
        }
      } else {
        setError(res.error ?? "Could not evaluate your answer.");
      }
    } catch {
      setError("Evaluation failed. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showNextQuestion = async () => {
    if (!sessionId) return;

    if (prefetchedNextQuestion) {
      setQuestion(prefetchedNextQuestion);
      setPrefetchedNextQuestion(null);
      setFeedback(null);
      setShowAnswerKey(false);
      setAnswerText("");
      setCodeText("");
      setRunOutput("");
      setError("");
      return;
    }

    await getQuestion();
  };

  const runCode = async () => {
    if (!codeText.trim()) return;
    setIsRunningCode(true);
    setError("");

    try {
      const run = await api.runCode("javascript", codeText, "");
      setRunOutput(JSON.stringify(run.result ?? run, null, 2));
    } catch {
      setError("Code execution failed. Verify Judge0 configuration.");
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleVoiceResult = (text: string) => {
    setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
  };

  const revealedAnswer = question ? (question.referenceSolution ?? question.canonicalAnswer ?? "") : "";

  return (
    <section className="ui-grid">
      <section className="panel interview-meta-panel reveal">
        <div className="panel-head">
          <h2>Interview Session</h2>
          <span className={`session-pill ${sessionId ? "session-pill--active" : ""}`}>
            {isCreatingSession ? "Creating session..." : sessionId ? "Session Active" : "Session Unavailable"}
          </span>
        </div>
        <p className="question-copy interview-meta-copy">
          {profile.role} • {profile.yearsExperience} years • {profile.activeSkill} • {level.toUpperCase()}
        </p>
        {onBackToProfile && (
          <div className="action-row action-row--spaced">
            <button className="btn btn--ghost" onClick={onBackToProfile} disabled={isFetchingQuestion || isSubmitting}>
              Back To Profile
            </button>
          </div>
        )}
      </section>

      {error && <div className="inline-error">{error}</div>}

      {question && (
        <section className="panel question-panel reveal">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Current Prompt</p>
              <h3>{question.title}</h3>
            </div>
            <span className={`type-pill ${question.type === "coding" ? "type-pill--coding" : "type-pill--theory"}`}>
              {question.type}
            </span>
          </div>

          <p className="question-copy">{question.questionText}</p>

          <div className="action-row action-row--spaced">
            <button
              className="btn btn--ghost"
              onClick={() => setShowAnswerKey((prev) => !prev)}
              disabled={isFetchingQuestion || isPreparingNextQuestion || !revealedAnswer}
            >
              {showAnswerKey ? "Hide Answer" : "Show Answer"}
            </button>
            {showAnswerKey && (
              <button
                className="btn btn--secondary"
                onClick={showNextQuestion}
                disabled={isFetchingQuestion || isPreparingNextQuestion}
              >
                {isPreparingNextQuestion ? "Preparing Next..." : "Next Question"}
              </button>
            )}
          </div>
          {showAnswerKey && (
            <div className="correction-block">
              <h4>Answer</h4>
              <p>{revealedAnswer || "Answer not available for this question."}</p>
            </div>
          )}

          {question.type === "theory" && (
            <>
              <label className="field-label" htmlFor="answer-input">
                Your Answer
              </label>
              <textarea
                id="answer-input"
                className="text-area"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                rows={6}
                placeholder="Explain your approach with structure, trade-offs, and implementation detail."
              />

              <div className="answer-actions">
                <VoiceControls onResult={handleVoiceResult} />
                <button
                  className="btn btn--primary"
                  onClick={() => submitAnswer()}
                  disabled={isSubmitting || !answerText.trim() || isFetchingQuestion}
                >
                  {isSubmitting ? "Evaluating..." : "Evaluate Answer"}
                </button>
              </div>
            </>
          )}

          {question.type === "coding" && (
            <div className="code-panel">
              <div className="panel-head panel-head--compact">
                <h4>Code Runner</h4>
                <span className="code-subtle">Runs through your `/api/run` endpoint</span>
              </div>

              <textarea
                className="code-area"
                rows={8}
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                placeholder="Paste JavaScript solution here..."
              />

              <div className="action-row">
                <button className="btn btn--secondary" onClick={runCode} disabled={isRunningCode || !codeText.trim()}>
                  {isRunningCode ? "Running..." : "Run Code"}
                </button>
                <button
                  className="btn btn--primary"
                  onClick={() => submitAnswer()}
                  disabled={isSubmitting || !codeText.trim() || isFetchingQuestion}
                >
                  {isSubmitting ? "Evaluating..." : "Evaluate Code"}
                </button>
              </div>

              {runOutput && <pre className="run-output">{runOutput}</pre>}
            </div>
          )}
        </section>
      )}

      {feedback && (
        <section className="panel feedback-panel reveal">
          <div className="panel-head">
            <h3>Feedback</h3>
            <span className={`score-pill score-pill--${scoreTone(feedback.score)}`}>{feedback.score ?? 0}/100</span>
          </div>

          <p className="feedback-copy">{feedback.feedback ?? "No feedback returned."}</p>

          <div className="correction-block">
            <h4>Improved Answer</h4>
            <p>{feedback.correction ?? "No correction returned."}</p>
          </div>

          <div className="action-row action-row--spaced">
            <button
              className="btn btn--secondary"
              onClick={showNextQuestion}
              disabled={isFetchingQuestion || isPreparingNextQuestion}
            >
              {isPreparingNextQuestion ? "Preparing Next..." : "Next Question"}
            </button>
          </div>

          {!!feedback.nextSteps?.length && (
            <div>
              <h4>Next Steps</h4>
              <ol className="steps-list">
                {feedback.nextSteps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {!!feedback.tests?.length && (
            <div>
              <h4>Coding Checks</h4>
              <div className="tests-grid">
                {feedback.tests.map((test, index) => (
                  <div key={`${test.stdin}-${index}`} className={`test-card ${test.passed ? "test-card--pass" : "test-card--fail"}`}>
                    <p className="test-status">{test.passed ? "Pass" : "Needs Work"}</p>
                    <p className="test-note">{test.note}</p>
                    <p className="test-meta">
                      <strong>Input:</strong> {test.stdin}
                    </p>
                    <p className="test-meta">
                      <strong>Expected:</strong> {test.expected}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
