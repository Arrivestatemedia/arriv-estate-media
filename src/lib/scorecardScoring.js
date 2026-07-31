/**
 * Shared scorecard scoring utilities.
 * Handles competency-based and section-based scoring with question weights.
 * Backward compatible with legacy question formats (score -> rating, competency -> competencies).
 */

/**
 * Normalize any question object to the enhanced schema.
 * Handles old formats: q.q -> question, q.score -> rating, q.competency (string) -> competencies (array).
 */
export function normalizeQuestion(q) {
  const competencies = Array.isArray(q.competencies) ? q.competencies
    : (typeof q.competencies === "string" && q.competencies.trim())
      ? q.competencies.split(",").map(s => s.trim()).filter(Boolean)
    : (typeof q.competency === "string" && q.competency.trim())
      ? q.competency.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  return {
    question: q.question || q.q || "",
    section: q.section || "",
    competencies,
    weight: q.weight ?? 1,
    excellent_answer: q.excellent_answer || "",
    poor_answer: q.poor_answer || "",
    why_this_matters: q.why_this_matters || "",
    rating: q.rating ?? q.score ?? 0,
    evidence: q.evidence || "",
    notes: q.notes || "",
  };
}

/**
 * Compute competency scores (0-100) from a list of questions.
 * Each competency's score = weighted average of ratings from all questions measuring it.
 * Only questions with rating > 0 are counted.
 */
export function computeCompetencyScores(questions) {
  const normalized = (questions || []).map(normalizeQuestion);
  const competencyEntries = {};

  normalized.forEach(q => {
    if (q.rating > 0 && q.competencies.length > 0) {
      q.competencies.forEach(comp => {
        if (!competencyEntries[comp]) competencyEntries[comp] = [];
        competencyEntries[comp].push({ rating: q.rating, weight: q.weight });
      });
    }
  });

  const scores = {};
  Object.entries(competencyEntries).forEach(([comp, entries]) => {
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    const weightedSum = entries.reduce((sum, e) => sum + e.rating * e.weight, 0);
    scores[comp] = totalWeight > 0
      ? Math.round((weightedSum / totalWeight / 5) * 100 * 10) / 10
      : 0;
  });

  return scores;
}

/**
 * Compute section scores (0-100) from questions grouped by their section field.
 * sectionWeights: { sectionName: weightPercentage } — used for overall calculation.
 * Returns { sectionName: { score, weight, answered } }
 */
export function computeSectionScores(questions, sectionWeights) {
  const normalized = (questions || []).map(normalizeQuestion);
  const sectionEntries = {};

  normalized.forEach(q => {
    const sec = q.section || "General";
    if (!sectionEntries[sec]) sectionEntries[sec] = [];
    if (q.rating > 0) {
      sectionEntries[sec].push({ rating: q.rating, weight: q.weight });
    }
  });

  const scores = {};
  const sectionNames = Object.keys(sectionEntries);
  const defaultWeight = sectionNames.length > 0 ? 100 / sectionNames.length : 0;

  Object.entries(sectionEntries).forEach(([sec, entries]) => {
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    const weightedSum = entries.reduce((sum, e) => sum + e.rating * e.weight, 0);
    const rawScore = totalWeight > 0 ? (weightedSum / totalWeight / 5) * 100 : 0;
    const weight = sectionWeights?.[sec] ?? defaultWeight;
    scores[sec] = {
      score: Math.round(rawScore * 10) / 10,
      weight,
      answered: entries.length,
    };
  });

  return scores;
}

/**
 * Compute overall interview score (0-100) from section scores.
 * overall = sum(section_score * section_weight) / sum(section_weights)
 */
export function computeOverallScore(sectionScores) {
  const entries = Object.values(sectionScores);
  const totalWeight = entries.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = entries.reduce((sum, s) => sum + s.score * s.weight, 0);
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Flatten all questions from a sections structure (for scoring).
 * Accepts either a flat array of questions or a sections array.
 */
export function flattenQuestions(sectionsOrQuestions) {
  if (!Array.isArray(sectionsOrQuestions)) return [];
  if (sectionsOrQuestions.length === 0) return [];
  // If first element has a "questions" array, it's a sections structure
  if (sectionsOrQuestions[0]?.questions) {
    return sectionsOrQuestions.flatMap(s =>
      (s.questions || []).map(q => ({ ...q, section: q.section || s.name }))
    );
  }
  return sectionsOrQuestions;
}