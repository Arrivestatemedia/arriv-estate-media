/**
 * Round 1 - 15-Minute General Competency Scorecard
 * 8 multi-competency questions covering 7 competencies.
 * Each answer may provide evidence for multiple competencies.
 * Final Score = Communication 20% + Confidence 15% + Coachability 20% +
 *               Work Ethic 15% + Professionalism 10% + Problem Solving/Judgment 10% + Culture Fit 10%
 */
export const ROUND1_SECTIONS = [
  {
    name: "Communication", weight: 20, questions: [
      {
        question: "Give me a quick overview of yourself, your experience, and what interested you in this opportunity with Arriv.",
        competencies: ["Communication", "Confidence", "Culture Fit"],
        weight: 1,
        excellent_answer: "Concise, structured overview; clearly explains relevant experience and specific interest in Arriv.",
        poor_answer: "Unfocused, vague, or cannot explain interest.",
        why_this_matters: "Reveals self-awareness, communication clarity, and genuine motivation for the role.",
      },
    ],
  },
  {
    name: "Confidence", weight: 15, questions: [
      {
        question: "Tell me about a time you took initiative or went beyond what was expected of you.",
        competencies: ["Work Ethic", "Initiative", "Confidence"],
        weight: 1,
        excellent_answer: "Voluntary action beyond normal expectations with clear motivation and impact.",
        poor_answer: "Routine duties presented as extra effort or no concrete example.",
        why_this_matters: "Assesses intrinsic drive, ownership mentality, and willingness to invest discretionary effort.",
      },
    ],
  },
  {
    name: "Coachability", weight: 20, questions: [
      {
        question: "Tell me about a time you received feedback or constructive criticism. What was the feedback, and what did you do differently afterward?",
        competencies: ["Coachability", "Accountability", "Growth Mindset"],
        weight: 1,
        excellent_answer: "Identifies specific feedback, owns reaction, explains concrete change and result.",
        poor_answer: "Defensive, superficial, or no action taken.",
        why_this_matters: "Assesses openness to feedback and capacity to act on it — core predictors of growth.",
      },
    ],
  },
  {
    name: "Work Ethic", weight: 15, questions: [
      {
        question: "Tell me about a challenging situation at work, school, or in another responsibility. What happened, what did you do, and what was the outcome?",
        competencies: ["Work Ethic", "Problem Solving", "Communication"],
        weight: 1,
        excellent_answer: "Specific challenge, clear personal actions, persistence, reasoning, and outcome.",
        poor_answer: "Vague challenge, little ownership, or no clear resolution.",
        why_this_matters: "Assesses persistence, problem-solving approach, and ability to push through difficulty.",
      },
      {
        question: "How do you keep yourself organized and accountable when you're responsible for multiple things without someone constantly checking on you?",
        competencies: ["Work Ethic", "Reliability", "Independence"],
        weight: 1,
        excellent_answer: "Specific systems for priorities, deadlines, follow-through, and self-accountability.",
        poor_answer: "Generic claims without methods or examples.",
        why_this_matters: "Indicates reliability, consistency, and ability to manage workload without constant oversight.",
      },
    ],
  },
  {
    name: "Professionalism", weight: 10, questions: [
      {
        question: "Tell me about a disagreement or difficult interaction with someone you worked with. How did you handle it?",
        competencies: ["Professionalism", "Communication", "Emotional Intelligence"],
        weight: 1,
        excellent_answer: "Objective description, measured response, listening/de-escalation, respectful resolution.",
        poor_answer: "Blame, escalation, avoidance, or disrespect.",
        why_this_matters: "Assesses conflict resolution skills, emotional regulation, and ability to maintain working relationships.",
      },
    ],
  },
  {
    name: "Problem Solving / Judgment", weight: 10, questions: [
      {
        question: "When you're given a problem you've never encountered before and don't have all the information, how do you figure out what to do?",
        competencies: ["Problem Solving / Judgment", "Adaptability"],
        weight: 1,
        excellent_answer: "Structured process — assesses knowns/unknowns, researches or asks for help, weighs risk, tests and learns.",
        poor_answer: "No process, guesses blindly, waits passively, or gives up.",
        why_this_matters: "Assesses learning agility and ability to navigate ambiguity.",
      },
    ],
  },
  {
    name: "Culture Fit", weight: 10, questions: [
      {
        question: "What kind of work environment and management style help you perform at your best, and what are you hoping to find at Arriv?",
        competencies: ["Culture Fit", "Self-Awareness", "Motivation"],
        weight: 1,
        excellent_answer: "Thoughtful preferences, adaptability, self-awareness, and specific connection to Arriv/opportunity.",
        poor_answer: "Generic preferences, rigid expectations, or little genuine interest.",
        why_this_matters: "Assesses cultural alignment, self-knowledge, and likelihood of long-term satisfaction.",
      },
    ],
  },
];

export const ROUND1_SECTION_WEIGHTS = ROUND1_SECTIONS.reduce((acc, s) => {
  acc[s.name] = s.weight;
  return acc;
}, {});

export const ROUND1_ALL_QUESTIONS = ROUND1_SECTIONS.flatMap(s =>
  s.questions.map(q => ({ ...q, section: s.name }))
);