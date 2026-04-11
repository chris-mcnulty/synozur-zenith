export const AI_PROVIDERS = {
  AZURE_FOUNDRY: 'azure_foundry',
  REPLIT_OPENAI: 'replit_openai',
  REPLIT_ANTHROPIC: 'replit_anthropic',
} as const;

export type AIProvider = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];

export const AI_FEATURES = {
  COPILOT_ASSESSMENT: 'copilot_assessment',
  IA_ASSESSMENT: 'ia_assessment',
  WORKSPACE_INSIGHT: 'workspace_insight',
  GOVERNANCE_NARRATIVE: 'governance_narrative',
} as const;

export type AIFeature = typeof AI_FEATURES[keyof typeof AI_FEATURES];

export const AI_FEATURE_LABELS: Record<AIFeature, string> = {
  [AI_FEATURES.COPILOT_ASSESSMENT]: 'Copilot Readiness Assessment',
  [AI_FEATURES.IA_ASSESSMENT]: 'Information Architecture Assessment',
  [AI_FEATURES.WORKSPACE_INSIGHT]: 'Workspace Insight',
  [AI_FEATURES.GOVERNANCE_NARRATIVE]: 'Governance Narrative',
};

export const AI_MODELS = {
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4_TURBO: 'gpt-4-turbo',
  CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20241022',
  CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];

export type AIModelInfo = {
  label: string;
  provider: AIProvider;
  inputPricePer1k: number;
  outputPricePer1k: number;
  contextWindow: number;
};

export const AI_MODEL_INFO: Record<AIModel, AIModelInfo> = {
  [AI_MODELS.GPT_4O]: {
    label: 'GPT-4o',
    provider: AI_PROVIDERS.REPLIT_OPENAI,
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.015,
    contextWindow: 128000,
  },
  [AI_MODELS.GPT_4O_MINI]: {
    label: 'GPT-4o Mini',
    provider: AI_PROVIDERS.REPLIT_OPENAI,
    inputPricePer1k: 0.00015,
    outputPricePer1k: 0.0006,
    contextWindow: 128000,
  },
  [AI_MODELS.GPT_4_TURBO]: {
    label: 'GPT-4 Turbo',
    provider: AI_PROVIDERS.REPLIT_OPENAI,
    inputPricePer1k: 0.01,
    outputPricePer1k: 0.03,
    contextWindow: 128000,
  },
  [AI_MODELS.CLAUDE_3_5_SONNET]: {
    label: 'Claude 3.5 Sonnet',
    provider: AI_PROVIDERS.REPLIT_ANTHROPIC,
    inputPricePer1k: 0.003,
    outputPricePer1k: 0.015,
    contextWindow: 200000,
  },
  [AI_MODELS.CLAUDE_3_HAIKU]: {
    label: 'Claude 3 Haiku',
    provider: AI_PROVIDERS.REPLIT_ANTHROPIC,
    inputPricePer1k: 0.00025,
    outputPricePer1k: 0.00125,
    contextWindow: 200000,
  },
};

export const AZURE_FOUNDRY_MODEL_ENDPOINT: Record<string, string> = {
  'gpt-4o': '/chat/completions',
  'gpt-4o-mini': '/chat/completions',
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  [AI_PROVIDERS.AZURE_FOUNDRY]: 'Azure AI Foundry',
  [AI_PROVIDERS.REPLIT_OPENAI]: 'Replit OpenAI',
  [AI_PROVIDERS.REPLIT_ANTHROPIC]: 'Replit Anthropic',
};

export const DEFAULT_FEATURE_ASSIGNMENTS: Record<AIFeature, { provider: AIProvider; model: string }> = {
  [AI_FEATURES.COPILOT_ASSESSMENT]: { provider: AI_PROVIDERS.AZURE_FOUNDRY, model: 'gpt-4o' },
  [AI_FEATURES.IA_ASSESSMENT]: { provider: AI_PROVIDERS.AZURE_FOUNDRY, model: 'gpt-4o' },
  [AI_FEATURES.WORKSPACE_INSIGHT]: { provider: AI_PROVIDERS.AZURE_FOUNDRY, model: 'gpt-4o-mini' },
  [AI_FEATURES.GOVERNANCE_NARRATIVE]: { provider: AI_PROVIDERS.AZURE_FOUNDRY, model: 'gpt-4o' },
};
