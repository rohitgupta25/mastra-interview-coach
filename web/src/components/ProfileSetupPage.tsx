import React, { useMemo, useState } from "react";
import {
  clampYearsToRole,
  type InterviewProfile,
  type QuestionLevel,
  ROLE_OPTIONS,
  SKILL_OPTIONS,
  type TargetRoleKey,
} from "../types/interview";

type Props = {
  onStart: (payload: { profile: InterviewProfile; level: QuestionLevel }) => void;
};

export default function ProfileSetupPage({ onStart }: Props) {
  const [roleKey, setRoleKey] = useState<TargetRoleKey | "">("");
  const [yearsExperience, setYearsExperience] = useState(4);
  const [activeSkill, setActiveSkill] = useState("");
  const [level, setLevel] = useState<QuestionLevel | null>(null);

  const selectedRole = useMemo(() => ROLE_OPTIONS.find((role) => role.key === roleKey), [roleKey]);
  const canStart = Boolean(selectedRole && activeSkill && level);

  const startInterview = () => {
    if (!selectedRole || !activeSkill || !level) return;

    onStart({
      profile: {
        roleKey: selectedRole.key,
        role: selectedRole.label.replace(/\s*\(.+\)\s*$/, ""),
        yearsExperience: clampYearsToRole(yearsExperience, selectedRole),
        skills: [...SKILL_OPTIONS],
        activeSkill,
      },
      level,
    });
  };

  return (
    <section className="panel profile-panel reveal">
      <div className="panel-head">
        <h2>Profile Setup</h2>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="role-input">
          Target Role
        </label>
        <select
          id="role-input"
          className="text-input text-input--select"
          value={roleKey}
          onChange={(e) => {
            const nextKey = e.target.value as TargetRoleKey | "";
            setRoleKey(nextKey);
            const role = ROLE_OPTIONS.find((item) => item.key === nextKey);
            if (role) {
              setYearsExperience((prev) => clampYearsToRole(prev, role));
            }
          }}
        >
          <option value="">Select target role</option>
          {ROLE_OPTIONS.map((role) => (
            <option key={role.key} value={role.key}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="experience-input">
          Years of Experience
        </label>
        <input
          id="experience-input"
          className="text-input"
          type="number"
          min={1}
          max={40}
          step={1}
          value={yearsExperience}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (!selectedRole) {
              setYearsExperience(Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 1);
              return;
            }
            setYearsExperience(clampYearsToRole(raw, selectedRole));
          }}
        />
      </div>

      <div className="skills-row profile-section-gap">
        {SKILL_OPTIONS.map((skill) => (
          <button
            key={skill}
            type="button"
            className={`skill-chip ${activeSkill === skill ? "skill-chip--active" : ""}`}
            onClick={() => setActiveSkill(skill)}
          >
            {skill}
          </button>
        ))}
      </div>

      <div className="button-row profile-section-gap">
        <button className={`btn ${level === "easy" ? "btn--primary" : "btn--ghost"}`} onClick={() => setLevel("easy")}>
          Easy
        </button>
        <button className={`btn ${level === "medium" ? "btn--primary" : "btn--ghost"}`} onClick={() => setLevel("medium")}>
          Medium
        </button>
        <button className={`btn ${level === "hard" ? "btn--primary" : "btn--ghost"}`} onClick={() => setLevel("hard")}>
          Hard
        </button>
      </div>

      <div className="button-row profile-section-gap">
        <button className="btn btn--primary" disabled={!canStart} onClick={startInterview}>
          Start Interview
        </button>
      </div>
    </section>
  );
}
