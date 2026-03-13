export type QuestionLevel = "easy" | "medium" | "hard";

export type TargetRoleKey =
  | "associate_consultant"
  | "technical_consultant"
  | "senior_technical_consultant"
  | "technical_architect";

export type RoleOption = {
  key: TargetRoleKey;
  label: string;
  minYears: number;
  maxYears?: number;
};

export type InterviewProfile = {
  roleKey: TargetRoleKey;
  role: string;
  yearsExperience: number;
  skills: string[];
  activeSkill: string;
};

export const ROLE_OPTIONS: RoleOption[] = [
  { key: "associate_consultant", label: "Associate Consultant (1-3)", minYears: 1, maxYears: 3 },
  { key: "technical_consultant", label: "Technical Consultant (3-7)", minYears: 3, maxYears: 7 },
  { key: "senior_technical_consultant", label: "Senior Technical Consultant (7-12)", minYears: 7, maxYears: 12 },
  { key: "technical_architect", label: "Technical Architect (13+)", minYears: 13 },
];

export const SKILL_OPTIONS = [
  "JavaScript",
  "React",
  "Preact",
  "System Design",
  "Adobe Commerce EDS",
  "Adobe Commerce Drop-ins",
];

export function clampYearsToRole(years: number, role: RoleOption) {
  const normalized = Number.isFinite(years) ? Math.max(0, Math.round(years)) : role.minYears;
  if (normalized < role.minYears) return role.minYears;
  if (typeof role.maxYears === "number" && normalized > role.maxYears) return role.maxYears;
  return normalized;
}
