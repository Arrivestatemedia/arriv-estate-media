/**
 * Enriched Round 1 question definitions with evidence-based evaluation metadata.
 * Each question includes: competencies[], weight, excellent_answer, poor_answer, why_this_matters.
 */
export const ROUND1_SECTIONS = [
  {
    name: "Communication", weight: 20, questions: [
      {
        question: "Tell me about yourself.",
        competencies: ["Communication", "Confidence"],
        weight: 1,
        excellent_answer: "Delivers a concise, structured narrative connecting relevant experience to the role without rambling.",
        poor_answer: "Rambles through personal history, lacks focus, or fails to connect background to the position.",
        why_this_matters: "Reveals self-awareness, communication style, and ability to synthesize information effectively.",
      },
      {
        question: "Tell me about a difficult conversation you handled well.",
        competencies: ["Communication", "Professionalism"],
        weight: 1,
        excellent_answer: "Describes the situation clearly, explains their approach to de-escalation, and shares a positive outcome with specific details.",
        poor_answer: "Vague description, blames the other party, or cannot articulate what made the conversation difficult.",
        why_this_matters: "Assesses ability to navigate conflict, listen actively, and communicate under pressure.",
      },
      {
        question: "How do you prefer to communicate with others and why?",
        competencies: ["Communication"],
        weight: 1,
        excellent_answer: "Shows self-awareness about communication preferences and adaptability to different styles and contexts.",
        poor_answer: "Single rigid preference with no awareness of when other styles might be more effective.",
        why_this_matters: "Indicates communication flexibility and ability to adapt to team and client needs.",
      },
    ],
  },
  {
    name: "Confidence", weight: 15, questions: [
      {
        question: "What accomplishment are you most proud of?",
        competencies: ["Confidence"],
        weight: 1,
        excellent_answer: "Speaks with genuine pride, credits collaborators, and connects the achievement to personal growth and capability.",
        poor_answer: "Downplays the achievement, cannot articulate why it matters, or takes sole credit without context.",
        why_this_matters: "Reveals self-perception, confidence level, and ability to own and articulate value.",
      },
      {
        question: "Describe a time you stepped outside your comfort zone.",
        competencies: ["Confidence", "Resilience"],
        weight: 1,
        excellent_answer: "Specific example with clear discomfort, deliberate action taken, and reflection on what was learned.",
        poor_answer: "Cannot identify a specific instance or describes a situation that wasn't genuinely challenging.",
        why_this_matters: "Assesses willingness to take risks, grow, and handle uncertainty.",
      },
      {
        question: "What motivates you every day?",
        competencies: ["Confidence"],
        weight: 1,
        excellent_answer: "Authentic, intrinsic motivation tied to meaningful goals with specific examples of how it drives action.",
        poor_answer: "Generic answer (money, stability) with no personal connection or examples of how motivation translates to effort.",
        why_this_matters: "Indicates drive, self-awareness, and sustainability of motivation over time.",
      },
    ],
  },
  {
    name: "Coachability", weight: 20, questions: [
      {
        question: "Tell me about a time you received constructive criticism.",
        competencies: ["Coachability"],
        weight: 1,
        excellent_answer: "Specific feedback example, describes initial reaction honestly, and explains how they processed and applied it.",
        poor_answer: "Cannot recall specific feedback, describes a superficial instance, or shows defensiveness about the criticism.",
        why_this_matters: "Assesses openness to feedback, a critical predictor of growth and adaptability.",
      },
      {
        question: "What did you do with that feedback?",
        competencies: ["Coachability", "Growth Mindset"],
        weight: 1,
        excellent_answer: "Concrete actions taken, measurable change achieved, and reflection on the process of improvement.",
        poor_answer: "Vague intentions, no specific actions, or claims the feedback wasn't really applicable.",
        why_this_matters: "Distinguishes those who hear feedback from those who act on it — the core of coachability.",
      },
      {
        question: "Tell me about a mistake you made and what you learned.",
        competencies: ["Coachability", "Accountability"],
        weight: 1,
        excellent_answer: "Owns the mistake without deflection, describes what happened honestly, and articulates a clear lesson learned.",
        poor_answer: "Blames circumstances or others, minimizes the mistake, or cannot identify a meaningful lesson.",
        why_this_matters: "Assesses accountability, honesty, and capacity for self-reflection and growth.",
      },
    ],
  },
  {
    name: "Work Ethic", weight: 15, questions: [
      {
        question: "Describe a difficult challenge you've overcome.",
        competencies: ["Work Ethic", "Problem Solving"],
        weight: 1,
        excellent_answer: "Specific challenge with clear obstacles, persistent effort described, and a concrete resolution with measurable outcome.",
        poor_answer: "Vague challenge, minimal effort described, or outcome attributed to luck or others rather than personal persistence.",
        why_this_matters: "Assesses persistence, problem-solving approach, and capacity to push through difficulty.",
      },
      {
        question: "How do you stay organized?",
        competencies: ["Work Ethic"],
        weight: 1,
        excellent_answer: "Specific systems or methods described with examples of how they manage priorities, deadlines, and follow-through.",
        poor_answer: "Generic claims of being organized with no systems, tools, or examples of how they actually manage work.",
        why_this_matters: "Indicates reliability, consistency, and ability to manage workload without constant oversight.",
      },
      {
        question: "Tell me about a time you went above and beyond.",
        competencies: ["Work Ethic", "Initiative"],
        weight: 1,
        excellent_answer: "Specific example where they exceeded expectations voluntarily, with clear motivation and measurable impact.",
        poor_answer: "Describes routine job duties as 'above and beyond' or cannot identify a genuine instance of extra effort.",
        why_this_matters: "Assesses intrinsic drive, ownership mentality, and willingness to invest discretionary effort.",
      },
    ],
  },
  {
    name: "Professionalism", weight: 10, questions: [
      {
        question: "Tell me about a disagreement with a coworker or manager.",
        competencies: ["Professionalism"],
        weight: 1,
        excellent_answer: "Describes the disagreement objectively, explains their approach to resolution, and reflects on the outcome respectfully.",
        poor_answer: "Speaks negatively about the other person, escalates rather than resolves, or avoids the conflict entirely.",
        why_this_matters: "Assesses conflict resolution skills, emotional regulation, and ability to maintain working relationships.",
      },
      {
        question: "How do you react when treated unfairly?",
        competencies: ["Professionalism", "Emotional Intelligence"],
        weight: 1,
        excellent_answer: "Describes a measured response, seeks to understand the other perspective, and channels frustration constructively.",
        poor_answer: "Describes reactive anger, passive-aggressive behavior, or a tendency to escalate rather than seek understanding.",
        why_this_matters: "Assesses emotional regulation, fairness orientation, and ability to handle workplace adversity.",
      },
    ],
  },
  {
    name: "Problem Solving / Judgment", weight: 10, questions: [
      {
        question: "Describe a time you had to make a decision with incomplete information.",
        competencies: ["Problem Solving", "Judgment"],
        weight: 1,
        excellent_answer: "Explains the context clearly, describes how they assessed available information, weighed risks, and made a reasoned decision with a defensible rationale.",
        poor_answer: "Cannot describe a specific instance, froze under uncertainty, or made a decision without any reasoning or risk awareness.",
        why_this_matters: "Assesses ability to act decisively and thoughtfully when full information isn't available — a daily reality in most roles.",
      },
      {
        question: "Tell me about a problem you solved that others couldn't.",
        competencies: ["Problem Solving", "Initiative"],
        weight: 1,
        excellent_answer: "Specific problem with clear obstacles others faced, describes their unique approach or perspective, and explains the solution with measurable impact.",
        poor_answer: "Vague problem, no distinction from what others tried, or attributes the solution to luck or outside help.",
        why_this_matters: "Reveals creative thinking, persistence, and ability to find solutions where others stall.",
      },
      {
        question: "How do you approach a problem you've never encountered before?",
        competencies: ["Problem Solving", "Adaptability"],
        weight: 1,
        excellent_answer: "Describes a structured approach: assess the situation, identify what's known vs. unknown, research or ask for help, test a solution, and learn from the outcome.",
        poor_answer: "No clear process, waits for someone else to solve it, or gives up quickly when faced with novelty.",
        why_this_matters: "Assesses learning agility and the ability to navigate ambiguity — critical for roles that evolve over time.",
      },
    ],
  },
  {
    name: "Culture Fit", weight: 10, questions: [
      {
        question: "What kind of manager brings out your best?",
        competencies: ["Culture Fit"],
        weight: 1,
        excellent_answer: "Thoughtful self-awareness about what management style helps them thrive, with specific examples from past experience.",
        poor_answer: "Generic preferences with no self-awareness, or describes a style that conflicts with the company's culture.",
        why_this_matters: "Assesses alignment with the company's management approach and self-knowledge about optimal working conditions.",
      },
      {
        question: "What type of company culture helps you thrive?",
        competencies: ["Culture Fit"],
        weight: 1,
        excellent_answer: "Describes cultural elements that align with the company's values, with specific examples of past environments where they excelled.",
        poor_answer: "Vague preferences or describes a culture that clearly conflicts with the company's actual environment.",
        why_this_matters: "Assesses cultural alignment and likelihood of long-term satisfaction and retention.",
      },
      {
        question: "Why do you want to work at Arriv?",
        competencies: ["Culture Fit", "Motivation"],
        weight: 1,
        excellent_answer: "Specific, researched reasons tied to the company's mission, values, or reputation, with genuine enthusiasm.",
        poor_answer: "Generic answer that could apply to any company, or focuses solely on compensation and benefits.",
        why_this_matters: "Assesses genuine interest, research effort, and likelihood of engagement and retention.",
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