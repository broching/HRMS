// Back-compat + shared helpers for the appraisal form builder.
//
// A review cycle's appraisal form is a structured `sections[] → fields[]`
// (`cycle.form`). Cycles created before the builder existed instead carry a
// flat `questionnaire: string[]` plus implicit objectives + competencies
// blocks. `normalizeForm` presents both shapes as a single `CycleForm` so all
// downstream code (renderer, scoring, submit validation) can ignore the
// difference.

import { Doc } from "../_generated/dataModel";
import type { CycleForm, FormField, FormSection } from "./enums";
import {
  DEFAULT_OBJECTIVES_WEIGHT_PCT,
  DEFAULT_COMPETENCIES_WEIGHT_PCT,
} from "./performanceDefaults";

// Stable field ids for the synthesized legacy blocks. The questionnaire lines
// map to `q{index}`, matching how legacy `selfAnswers[]` / `appraiserAnswers[]`
// were positionally indexed.
export const LEGACY_OBJECTIVES_FIELD_ID = "objectives";
export const LEGACY_COMPETENCIES_FIELD_ID = "competencies";
export function legacyQuestionFieldId(index: number): string {
  return `q${index}`;
}

/** Whether a field type is answered via the dedicated objectives/competencies
 * tables rather than the generic `reviewAnswers` table. */
export function isBlockField(type: FormField["type"]): boolean {
  return type === "objectives" || type === "competencies";
}

/** Whether a field type carries a stored answer (i.e. not a layout `section`). */
export function isAnswerableField(type: FormField["type"]): boolean {
  return type !== "section";
}

/** Present a cycle's appraisal form, synthesizing one from legacy fields when
 * the structured `form` is absent. Never returns an empty form. */
export function normalizeForm(cycle: Doc<"reviewCycles">): CycleForm {
  if (cycle.form && cycle.form.sections.length > 0) return cycle.form;

  const sections: FormSection[] = [];

  // Objectives block (weighted) — legacy cycles always had one.
  sections.push({
    id: "objectives",
    title: "Objectives",
    fields: [
      {
        id: LEGACY_OBJECTIVES_FIELD_ID,
        type: "objectives",
        label: "Objectives",
        side: "both",
        weightPct: cycle.objectivesWeightPct ?? DEFAULT_OBJECTIVES_WEIGHT_PCT,
      },
    ],
  });

  // Competencies block.
  sections.push({
    id: "competencies",
    title: "Competencies",
    fields: [
      {
        id: LEGACY_COMPETENCIES_FIELD_ID,
        type: "competencies",
        label: "Competencies",
        side: "both",
        weightPct: cycle.competenciesWeightPct ?? DEFAULT_COMPETENCIES_WEIGHT_PCT,
      },
    ],
  });

  // Questionnaire — each legacy line becomes a both-sided long-text field.
  const questions = cycle.questionnaire ?? [];
  if (questions.length > 0) {
    sections.push({
      id: "questionnaire",
      title: "Questionnaire",
      fields: questions.map(
        (q, i): FormField => ({
          id: legacyQuestionFieldId(i),
          type: "longText",
          label: q,
          side: "both",
        }),
      ),
    });
  }

  return { sections };
}

/** Flatten a form to its answerable fields (skips `section` headings), in order. */
export function answerableFields(form: CycleForm): FormField[] {
  return form.sections.flatMap((s) => s.fields).filter((f) => isAnswerableField(f.type));
}

/** Trim + validate a form saved from the builder. Throws on structural errors;
 * returns the cleaned form. Field/section ids must be present + unique. */
export function normalizeAndValidateForm(form: CycleForm): CycleForm {
  if (!form.sections.length) throw new Error("A form needs at least one section.");

  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();
  let answerable = 0;

  const sections = form.sections.map((s) => {
    const id = s.id.trim();
    const title = s.title.trim();
    if (!id) throw new Error("Every section needs an id.");
    if (sectionIds.has(id)) throw new Error(`Duplicate section id: ${id}`);
    sectionIds.add(id);
    if (!title) throw new Error("Every section needs a title.");

    const fields = s.fields.map((f) => {
      const fid = f.id.trim();
      const label = f.label.trim();
      if (!fid) throw new Error("Every field needs an id.");
      if (fieldIds.has(fid)) throw new Error(`Duplicate field id: ${fid}`);
      fieldIds.add(fid);
      if (!label) throw new Error("Every field needs a label.");

      if (isAnswerableField(f.type)) answerable += 1;

      if ((f.type === "radio" || f.type === "checkbox")) {
        const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) {
          throw new Error(`"${label}" needs at least two options.`);
        }
      }
      if (f.type === "ratingScale" && f.scaleMax != null) {
        if (!Number.isInteger(f.scaleMax) || f.scaleMax < 2 || f.scaleMax > 10) {
          throw new Error(`"${label}" rating scale must be a whole number 2–10.`);
        }
      }
      if (f.weightPct != null) {
        if (!Number.isFinite(f.weightPct) || f.weightPct < 0 || f.weightPct > 100) {
          throw new Error(`"${label}" weight must be between 0 and 100.`);
        }
      }

      return {
        ...f,
        id: fid,
        label,
        description: f.description?.trim() || undefined,
        options:
          f.type === "radio" || f.type === "checkbox"
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
      } satisfies FormField;
    });

    return { ...s, id, title, description: s.description?.trim() || undefined, fields };
  });

  if (answerable === 0) {
    throw new Error("A form needs at least one question (not just headings).");
  }
  return { sections };
}
