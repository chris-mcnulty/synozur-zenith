import { pool } from '../db';
import {
  AI_PROVIDERS,
  DEFAULT_FEATURE_ASSIGNMENTS,
  type AIProvider,
  type AIFeature,
} from '@shared/ai-schema';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: AIProvider;
  durationMs: number;
}

export interface IAIProvider {
  name: AIProvider;
  complete(messages: AIMessage[], model: string, maxTokens?: number): Promise<AICompletionResult>;
  isAvailable(): boolean;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface AzureFoundryResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface EntraTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface EntraTokenCache {
  accessToken: string;
  expiresAt: number;
}

let entraTokenCache: EntraTokenCache | null = null;
const ENTRA_TOKEN_REFRESH_BUFFER_MS = 60_000;

async function getEntraAccessToken(): Promise<string> {
  const now = Date.now();
  if (entraTokenCache && now < entraTokenCache.expiresAt) {
    return entraTokenCache.accessToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure Entra credentials not configured (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET required)');
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://cognitiveservices.azure.com/.default',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Entra token acquisition failed ${res.status}: ${text}`);
  }

  const data = await res.json() as EntraTokenResponse;
  const expiresAt = now + (data.expires_in * 1000) - ENTRA_TOKEN_REFRESH_BUFFER_MS;

  entraTokenCache = {
    accessToken: data.access_token,
    expiresAt,
  };

  return data.access_token;
}

function hasEntraCredentials(): boolean {
  return !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

export class ReplitOpenAIProvider implements IAIProvider {
  name: AIProvider = AI_PROVIDERS.REPLIT_OPENAI;

  isAvailable(): boolean {
    return !!(process.env.OPENAI_API_KEY);
  }

  async complete(messages: AIMessage[], model: string, maxTokens = 1024): Promise<AICompletionResult> {
    if (!this.isAvailable()) throw new Error('OpenAI provider not configured');

    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text}`);
    }

    const data = await res.json() as OpenAIResponse;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }
}

export class ReplitAnthropicProvider implements IAIProvider {
  name: AIProvider = AI_PROVIDERS.REPLIT_ANTHROPIC;

  isAvailable(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY);
  }

  async complete(messages: AIMessage[], model: string, maxTokens = 1024): Promise<AICompletionResult> {
    if (!this.isAvailable()) throw new Error('Anthropic provider not configured');

    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const start = Date.now();
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: chatMessages,
    };
    if (systemMsg) body.system = systemMsg;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${text}`);
    }

    const data = await res.json() as AnthropicResponse;
    const contentBlock = data.content?.[0];
    return {
      content: contentBlock?.type === 'text' ? (contentBlock.text ?? '') : '',
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }
}

export class AzureFoundryProvider implements IAIProvider {
  name: AIProvider = AI_PROVIDERS.AZURE_FOUNDRY;

  isAvailable(): boolean {
    const hasEndpoint = !!(
      process.env.AZURE_FOUNDRY_OPENAI_ENDPOINT || process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT
    );
    const hasAuth = !!(process.env.AZURE_FOUNDRY_API_KEY) || hasEntraCredentials();
    return hasEndpoint && hasAuth;
  }

  private async buildAuthHeaders(): Promise<Record<string, string>> {
    if (hasEntraCredentials()) {
      const token = await getEntraAccessToken();
      return { 'Authorization': `Bearer ${token}` };
    }
    return { 'api-key': process.env.AZURE_FOUNDRY_API_KEY! };
  }

  private async completeViaAoai(messages: AIMessage[], model: string, maxTokens: number): Promise<AICompletionResult> {
    const endpoint = process.env.AZURE_FOUNDRY_OPENAI_ENDPOINT!.replace(/\/$/, '');
    const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=2024-05-01-preview`;

    const authHeaders = await this.buildAuthHeaders();

    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ messages, max_tokens: maxTokens }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure Foundry AOAI error ${res.status}: ${text}`);
    }

    const data = await res.json() as AzureFoundryResponse;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }

  private async completeViaInference(messages: AIMessage[], model: string, maxTokens: number): Promise<AICompletionResult> {
    const projectEndpoint = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT!.replace(/\/$/, '');
    const url = `${projectEndpoint}/chat/completions?api-version=2024-05-01-preview`;

    const authHeaders = await this.buildAuthHeaders();

    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'extra-parameters': 'ignore',
        ...authHeaders,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure Foundry Inference error ${res.status}: ${text}`);
    }

    const data = await res.json() as AzureFoundryResponse;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }

  async complete(messages: AIMessage[], model: string, maxTokens = 1024): Promise<AICompletionResult> {
    if (!this.isAvailable()) throw new Error('Azure AI Foundry provider not configured');

    if (process.env.AZURE_FOUNDRY_OPENAI_ENDPOINT) {
      return this.completeViaAoai(messages, model, maxTokens);
    }
    return this.completeViaInference(messages, model, maxTokens);
  }
}

const azureFoundryProvider = new AzureFoundryProvider();
const openAiProvider = new ReplitOpenAIProvider();
const anthropicProvider = new ReplitAnthropicProvider();

const providers: IAIProvider[] = [azureFoundryProvider, openAiProvider, anthropicProvider];

const providerMap: Record<AIProvider, IAIProvider> = {
  [AI_PROVIDERS.AZURE_FOUNDRY]: azureFoundryProvider,
  [AI_PROVIDERS.REPLIT_OPENAI]: openAiProvider,
  [AI_PROVIDERS.REPLIT_ANTHROPIC]: anthropicProvider,
};

interface FeatureAssignment {
  provider: AIProvider;
  model: string;
}

export interface AIConfiguration {
  defaultProvider: AIProvider;
  monthlyTokenBudget: number | null;
  alertThresholdPercent: number;
  alertEmail: string | null;
}

interface ConfigCacheEntry {
  assignments: Record<AIFeature, FeatureAssignment>;
  configuration: AIConfiguration;
  expiresAt: number;
}

const CONFIG_TTL_MS = 60_000;
let configCache: ConfigCacheEntry | null = null;

async function loadConfiguration(): Promise<ConfigCacheEntry> {
  if (configCache && Date.now() < configCache.expiresAt) {
    return configCache;
  }

  let defaultConfig: AIConfiguration = {
    defaultProvider: AI_PROVIDERS.AZURE_FOUNDRY,
    monthlyTokenBudget: null,
    alertThresholdPercent: 80,
    alertEmail: null,
  };

  const assignments: Record<AIFeature, FeatureAssignment> = { ...DEFAULT_FEATURE_ASSIGNMENTS };

  try {
    const client = await pool.connect();
    try {
      const { rows: cfgRows } = await client.query(
        `SELECT default_provider, monthly_token_budget, alert_threshold_percent, alert_email
         FROM ai_configuration
         WHERE singleton_key = 'default'
         LIMIT 1`
      );
      if (cfgRows.length > 0) {
        const cfg = cfgRows[0] as {
          default_provider: string;
          monthly_token_budget: number | null;
          alert_threshold_percent: number;
          alert_email: string | null;
        };
        defaultConfig = {
          defaultProvider: (cfg.default_provider as AIProvider) ?? AI_PROVIDERS.AZURE_FOUNDRY,
          monthlyTokenBudget: cfg.monthly_token_budget ?? null,
          alertThresholdPercent: cfg.alert_threshold_percent ?? 80,
          alertEmail: cfg.alert_email ?? null,
        };
      }

      const { rows: assignmentRows } = await client.query(
        `SELECT feature, provider, model FROM ai_feature_model_assignments WHERE is_active = true`
      );
      for (const row of assignmentRows as Array<{ feature: string; provider: string; model: string }>) {
        if (row.feature in assignments) {
          assignments[row.feature as AIFeature] = {
            provider: row.provider as AIProvider,
            model: row.model,
          };
        }
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[AI] Failed to load AI configuration from DB, using defaults:', err);
  }

  configCache = {
    assignments,
    configuration: defaultConfig,
    expiresAt: Date.now() + CONFIG_TTL_MS,
  };
  return configCache;
}

export function invalidateConfigCache(): void {
  configCache = null;
}

export async function getConfiguration(): Promise<AIConfiguration> {
  const { configuration } = await loadConfiguration();
  return configuration;
}

export async function getProviderForFeature(feature: AIFeature): Promise<{ provider: IAIProvider; model: string }> {
  const { assignments, configuration } = await loadConfiguration();
  const assignment = assignments[feature];

  let resolvedProviderName: AIProvider = assignment.provider;

  if (!providerMap[resolvedProviderName]?.isAvailable()) {
    resolvedProviderName = configuration.defaultProvider;
  }
  if (!providerMap[resolvedProviderName]?.isAvailable()) {
    const anyAvailable = providers.find(p => p.isAvailable());
    if (anyAvailable) resolvedProviderName = anyAvailable.name;
  }

  const provider = providerMap[resolvedProviderName] ?? azureFoundryProvider;
  return { provider, model: assignment.model };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function completeForFeature(
  feature: AIFeature,
  messages: AIMessage[],
  maxTokens = 1024,
): Promise<AICompletionResult> {
  const { provider, model } = await getProviderForFeature(feature);

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (!provider.isAvailable()) throw new Error(`Provider ${provider.name} is not available`);
      return await provider.complete(messages, model, maxTokens);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastErr = error;
      const is429 = error.message.includes('429');
      if (!is429 || attempt === MAX_RETRIES - 1) break;
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  for (const fallback of providers) {
    if (fallback.name === provider.name) continue;
    if (!fallback.isAvailable()) continue;
    try {
      const fallbackModel =
        fallback.name === AI_PROVIDERS.REPLIT_OPENAI ? 'gpt-4o' :
        fallback.name === AI_PROVIDERS.REPLIT_ANTHROPIC ? 'claude-3-5-sonnet-20241022' :
        model;
      return await fallback.complete(messages, fallbackModel, maxTokens);
    } catch {
      continue;
    }
  }

  throw lastErr ?? new Error('All AI providers failed');
}

export function getProviderStatus(): Array<{ name: AIProvider; available: boolean; label: string; authMethod?: string }> {
  return [
    {
      name: AI_PROVIDERS.AZURE_FOUNDRY,
      available: azureFoundryProvider.isAvailable(),
      label: 'Azure AI Foundry',
      authMethod: hasEntraCredentials() ? 'managed-identity' : 'api-key',
    },
    { name: AI_PROVIDERS.REPLIT_OPENAI, available: openAiProvider.isAvailable(), label: 'Replit OpenAI' },
    { name: AI_PROVIDERS.REPLIT_ANTHROPIC, available: anthropicProvider.isAvailable(), label: 'Replit Anthropic' },
  ];
}
