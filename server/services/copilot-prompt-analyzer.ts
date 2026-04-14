/**
 * Copilot Prompt Analyzer (BL-038)
 *
 * Deterministic quality and risk scoring engine for M365 Copilot prompts.
 * Each prompt is evaluated against five category-specific signal sets and
 * produces:
 *
 *   - qualityScore  0–100 weighted composite
 *   - qualityTier   GREAT | GOOD | WEAK | PROBLEMATIC
 *   - riskLevel     NONE | LOW | MEDIUM | HIGH | CRITICAL
 *   - flags         Array of CopilotPromptFlag (category, signal, severity)
 *   - recommendation One-sentence remediation guidance (or null if GREAT)
 *
 * No AI calls are made here — the analyzer is cheap, synchronous, and
 * suitable for bulk batch processing of thousands of interactions.
 */

import type {
  CopilotPromptFlag,
  CopilotFlagCategory,
  CopilotQualityTier,
  CopilotRiskLevel,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Signal definitions
// ---------------------------------------------------------------------------

interface RiskSignal {
  pattern: RegExp;
  signal: string;
  severity: CopilotRiskLevel;
  category: CopilotFlagCategory;
  detail?: string;
}

/**
 * Content Safety — harassment, hate speech, extremism, explicit content,
 * self-harm, and illicit-behavior requests.
 * These align with Category 1 of the 5-category quality & safety framework.
 */
const CONTENT_SAFETY_SIGNALS: RiskSignal[] = [
  {
    pattern: /\b(?:kill|murder|assault|rape|torture|harm|hurt|attack)\b.*\b(?:person|people|user|them|him|her|you)\b/i,
    signal: "HARASSMENT_OR_VIOLENCE",
    severity: "CRITICAL",
    category: "CONTENT_SAFETY",
    detail: "Prompt contains language indicative of threats or harassment.",
  },
  {
    pattern: /\b(?:hate|racist|racism|nazi|white supremac|ethnic cleansing|slur|n-word)\b/i,
    signal: "HATE_SPEECH",
    severity: "CRITICAL",
    category: "CONTENT_SAFETY",
    detail: "Prompt contains hate speech or discriminatory language.",
  },
  {
    pattern: /\b(?:terrorist|extremist|radicali[sz]|jihad|isis|al-qaeda|bomb-making|explosive device)\b/i,
    signal: "EXTREMISM",
    severity: "CRITICAL",
    category: "CONTENT_SAFETY",
    detail: "Prompt references extremist or terrorist content.",
  },
  {
    pattern: /\b(?:suicide|self[_\s-]?harm|cut myself|overdose|end my life|kill myself)\b/i,
    signal: "SELF_HARM",
    severity: "CRITICAL",
    category: "CONTENT_SAFETY",
    detail: "Prompt contains self-harm or suicidal ideation language.",
  },
  {
    pattern: /\b(?:pornograph|sexually explicit|nude|explicit (?:image|video|content)|nsfw)\b/i,
    signal: "EXPLICIT_CONTENT",
    severity: "HIGH",
    category: "CONTENT_SAFETY",
    detail: "Prompt requests or references sexually explicit material.",
  },
  {
    pattern: /\b(?:drug deal|buy drugs|sell drugs|how to get (?:cocaine|heroin|meth)|illicit substance)\b/i,
    signal: "ILLICIT_BEHAVIOR",
    severity: "HIGH",
    category: "CONTENT_SAFETY",
    detail: "Prompt references illicit drug activity.",
  },
];

/**
 * Sensitive Data Exposure — PII, credentials, payment card data, and
 * other information that must not be shared with AI systems.
 * These align with Category 3 of the 5-category framework.
 */
const SENSITIVE_DATA_EXPOSURE_SIGNALS: RiskSignal[] = [
  {
    pattern: /\b(?:ssn|social security|tax id|sin\b)/i,
    signal: "SSN_OR_TAX_ID",
    severity: "CRITICAL",
    category: "SENSITIVE_DATA",
    detail: "Prompt appears to reference a government identifier.",
  },
  {
    pattern: /\b(?:password|passwd|secret|api[_\s-]?key|access[_\s-]?token|bearer)\b/i,
    signal: "CREDENTIAL_EXPOSURE",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Prompt references credential-adjacent terms.",
  },
  {
    pattern: /\b(?:credit card|card number|cvv|expir(?:y|ation)|account number)\b/i,
    signal: "FINANCIAL_PII",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Prompt may contain payment card information.",
  },
  {
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,
    signal: "SSN_PATTERN",
    severity: "CRITICAL",
    category: "SENSITIVE_DATA",
    detail: "Prompt contains a string matching SSN format.",
  },
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/,
    signal: "CREDIT_CARD_PATTERN",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Prompt contains a string matching a credit card number pattern.",
  },
];

/** Misuse — prompt injection, jailbreak, policy bypass attempts */
const MISUSE_SIGNALS: RiskSignal[] = [
  {
    pattern: /ignore (?:all |previous |prior |above )?(?:instructions?|prompts?|rules?|guidelines?)/i,
    signal: "PROMPT_INJECTION_IGNORE",
    severity: "CRITICAL",
    category: "MISUSE",
    detail: "Classic prompt-injection attempt to override system instructions.",
  },
  {
    pattern: /\b(?:jailbreak|dan mode|developer mode|god mode|act as if)\b/i,
    signal: "JAILBREAK_ATTEMPT",
    severity: "CRITICAL",
    category: "MISUSE",
    detail: "Known jailbreak phrase detected.",
  },
  {
    pattern: /pretend (?:you are|to be|you're) (?:an? )?(?!assistant|copilot)/i,
    signal: "PERSONA_OVERRIDE",
    severity: "HIGH",
    category: "MISUSE",
    detail: "Prompt attempts to assign a non-standard AI persona.",
  },
  {
    pattern: /\b(?:bypass|circumvent|override|disable|turn off) (?:the |your )?(?:filter|policy|safeguard|restriction|safety)/i,
    signal: "POLICY_BYPASS",
    severity: "HIGH",
    category: "MISUSE",
    detail: "Prompt requests disabling safety controls.",
  },
  {
    pattern: /write (?:me )?(?:a )?(?:malware|virus|exploit|ransomware|keylogger|trojan)/i,
    signal: "MALWARE_REQUEST",
    severity: "CRITICAL",
    category: "MISUSE",
    detail: "Prompt appears to request malicious code.",
  },
];

/** Sensitive Data — MNPI, HR, legal, health */
const SENSITIVE_DATA_SIGNALS: RiskSignal[] = [
  {
    pattern: /\b(?:mnpi|material non-public|insider information|merger|acquisition|takeover)\b/i,
    signal: "MNPI_RISK",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Possible material non-public information reference.",
  },
  {
    pattern: /\b(?:medical record|diagnosis|prescription|hipaa|phi|patient data)\b/i,
    signal: "HEALTH_DATA",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Prompt references health-related data.",
  },
  {
    pattern: /\b(?:salary|compensation|bonus|equity|stock option|payroll)\b/i,
    signal: "COMPENSATION_DATA",
    severity: "MEDIUM",
    category: "SENSITIVE_DATA",
    detail: "Prompt references compensation or payroll information.",
  },
  {
    pattern: /\b(?:litigation|lawsuit|legal hold|attorney[-\s]client|privileged)\b/i,
    signal: "LEGAL_PRIVILEGED",
    severity: "HIGH",
    category: "SENSITIVE_DATA",
    detail: "Prompt may involve legally privileged content.",
  },
  {
    pattern: /\b(?:gdpr|personal data|data subject|right to erasure|ccpa)\b/i,
    signal: "PRIVACY_REG_DATA",
    severity: "MEDIUM",
    category: "SENSITIVE_DATA",
    detail: "Prompt references personal data under privacy regulations.",
  },
];

/** Quality — prompt completeness, specificity, constructiveness */
interface QualitySignal {
  pattern: RegExp;
  signal: string;
  detail?: string;
  penaltyPoints: number;
}

const QUALITY_PENALTY_SIGNALS: QualitySignal[] = [
  {
    pattern: /^.{1,15}$/s,
    signal: "TOO_SHORT",
    detail: "Prompt is fewer than 15 characters — likely under-specified.",
    penaltyPoints: 30,
  },
  {
    pattern: /^(?:hi|hello|hey|test|ok|okay|yes|no|what|why|how|help)\.?$/i,
    signal: "TRIVIAL_PROMPT",
    detail: "Prompt is a single trivial word with no meaningful context.",
    penaltyPoints: 40,
  },
  {
    pattern: /\b(?:do it|just do it|do the thing|make it work)\b/i,
    signal: "VAGUE_ACTION",
    detail: "Prompt uses vague action phrases without context.",
    penaltyPoints: 20,
  },
  {
    pattern: /^.{1501,}$/s,
    signal: "OVERLY_LONG",
    detail: "Prompt exceeds 1500 characters — may be a bulk data dump.",
    penaltyPoints: 10,
  },
];

const QUALITY_BONUS_SIGNALS: Array<{ pattern: RegExp; bonusPoints: number }> = [
  { pattern: /\?/, bonusPoints: 5 },           // Has a question mark
  { pattern: /\b(?:please|could you|can you)\b/i, bonusPoints: 3 }, // Polite phrasing
  { pattern: /\b(?:step|steps|outline|list|summarize|explain|describe|compare|analyze|review)\b/i, bonusPoints: 8 }, // Task verbs
  { pattern: /\b(?:based on|given|regarding|about|context|background)\b/i, bonusPoints: 8 }, // Context framing
];

/** Feasibility — requests that are impossible or out of scope for Copilot */
const FEASIBILITY_SIGNALS: RiskSignal[] = [
  {
    pattern: /\b(?:browse the internet|search the web|real[-\s]?time|live data|current price|today'?s? (?:stock|news|weather))\b/i,
    signal: "REALTIME_DATA_REQUEST",
    severity: "LOW",
    category: "FEASIBILITY",
    detail: "Copilot cannot access live internet data without plugins.",
  },
  {
    pattern: /\b(?:send an email|schedule a meeting|call|phone|text message)\b/i,
    signal: "ACTION_OUTSIDE_SCOPE",
    severity: "LOW",
    category: "FEASIBILITY",
    detail: "Request may be outside what Copilot can action directly.",
  },
  {
    pattern: /\b(?:execute|run|deploy|install|delete|drop (?:table|database|schema))\b/i,
    signal: "SYSTEM_COMMAND_REQUEST",
    severity: "MEDIUM",
    category: "FEASIBILITY",
    detail: "Prompt requests potentially destructive system-level actions.",
  },
];

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

export interface PromptAnalysisResult {
  qualityScore: number;
  qualityTier: CopilotQualityTier;
  riskLevel: CopilotRiskLevel;
  flags: CopilotPromptFlag[];
  recommendation: string | null;
}

const RISK_SEVERITY_WEIGHTS: Record<CopilotRiskLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  CRITICAL: 8,
};

function aggregateRiskLevel(flags: CopilotPromptFlag[]): CopilotRiskLevel {
  const totalWeight = flags.reduce(
    (sum, f) => sum + (RISK_SEVERITY_WEIGHTS[f.severity] ?? 0),
    0,
  );
  if (totalWeight === 0) return "NONE";
  if (totalWeight <= 1) return "LOW";
  if (totalWeight <= 3) return "MEDIUM";
  if (totalWeight <= 7) return "HIGH";
  return "CRITICAL";
}

function qualityTierFromScore(score: number, riskLevel: CopilotRiskLevel): CopilotQualityTier {
  // CRITICAL or HIGH risk always at least PROBLEMATIC
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") return "PROBLEMATIC";
  if (score >= 80) return "GREAT";
  if (score >= 60) return "GOOD";
  if (score >= 40) return "WEAK";
  return "PROBLEMATIC";
}

function buildRecommendation(
  flags: CopilotPromptFlag[],
  qualityTier: CopilotQualityTier,
): string | null {
  if (qualityTier === "GREAT") return null;

  const critical = flags.find(f => f.severity === "CRITICAL");
  const high = flags.find(f => f.severity === "HIGH");

  if (critical?.category === "CONTENT_SAFETY") {
    return "Prompt contains policy-violating language (harassment, hate speech, or self-harm). Escalate per your Acceptable Use Policy.";
  }
  if (critical?.category === "MISUSE") {
    return "Prompt contains policy-violation language. Retrain the user on acceptable Copilot use.";
  }
  if (critical?.category === "SENSITIVE_DATA") {
    return "Remove personally identifiable or credential information from the prompt before resubmitting.";
  }
  if (high?.category === "SENSITIVE_DATA") {
    return "Avoid including sensitive business data (credentials, compensation, health records, legal-privilege terms) in Copilot prompts.";
  }
  if (high?.category === "CONTENT_SAFETY") {
    return "Prompt contains inappropriate content. Review user activity and reinforce Acceptable Use Policy.";
  }

  // Quality-only issues
  const qualityFlag = flags.find(f => f.category === "QUALITY");
  if (qualityFlag?.signal === "TOO_SHORT" || qualityFlag?.signal === "TRIVIAL_PROMPT") {
    return "Encourage users to write more descriptive prompts with clear task context for better Copilot responses.";
  }
  if (qualityFlag?.signal === "VAGUE_ACTION") {
    return "Prompt lacks specificity. Users should describe the desired outcome and provide relevant context.";
  }

  const feasibilityFlag = flags.find(f => f.category === "FEASIBILITY");
  if (feasibilityFlag) {
    return "Prompt requests capabilities outside Copilot scope. Review Copilot feature documentation with the user.";
  }

  if (qualityTier === "WEAK") {
    return "Prompt quality is below average. Encourage richer context and clearer task descriptions.";
  }

  return "Review flagged signals and update the Copilot usage guidelines for this user.";
}

/**
 * Analyze a single prompt text and return quality/risk scores plus flags.
 * Synchronous and CPU-only — safe to call in a tight loop.
 */
export function analyzePrompt(promptText: string): PromptAnalysisResult {
  const flags: CopilotPromptFlag[] = [];

  // ── Risk signals ────────────────────────────────────────────────────────
  for (const sig of [
    ...CONTENT_SAFETY_SIGNALS,
    ...MISUSE_SIGNALS,
    ...SENSITIVE_DATA_EXPOSURE_SIGNALS,
    ...SENSITIVE_DATA_SIGNALS,
    ...FEASIBILITY_SIGNALS,
  ]) {
    if (sig.pattern.test(promptText)) {
      flags.push({
        category: sig.category,
        signal: sig.signal,
        severity: sig.severity,
        detail: sig.detail,
      });
    }
  }

  // ── Quality scoring ──────────────────────────────────────────────────────
  let baseScore = 70; // start above average; penalties and bonuses adjust

  let qualityFlag = false;
  for (const sig of QUALITY_PENALTY_SIGNALS) {
    if (sig.pattern.test(promptText)) {
      baseScore -= sig.penaltyPoints;
      flags.push({
        category: "QUALITY",
        signal: sig.signal,
        severity: "LOW",
        detail: sig.detail,
      });
      qualityFlag = true;
      break; // only apply the first matching quality penalty to avoid double-dipping
    }
  }

  if (!qualityFlag) {
    for (const bonus of QUALITY_BONUS_SIGNALS) {
      if (bonus.pattern.test(promptText)) {
        baseScore += bonus.bonusPoints;
      }
    }
  }

  const qualityScore = Math.max(0, Math.min(100, Math.round(baseScore)));
  const riskLevel = aggregateRiskLevel(flags);
  const qualityTier = qualityTierFromScore(qualityScore, riskLevel);
  const recommendation = buildRecommendation(flags, qualityTier);

  return { qualityScore, qualityTier, riskLevel, flags, recommendation };
}
