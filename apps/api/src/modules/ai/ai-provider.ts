// AI Provider abstraction — allows swapping the backend (local rule-based, OpenAI, Anthropic, etc.)
// without changing the service or route layer.

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  chat(prompt: string, context: AIContext): Promise<AIProviderResult>;
  summarize(text: string, documentName: string): Promise<AIProviderResult>;
  extract(text: string, query: string): Promise<AIProviderResult>;
  classify(text: string, documentName: string): Promise<AIProviderResult>;
  keywords(text: string): Promise<AIProviderResult>;
  qa(text: string, question: string): Promise<AIProviderResult>;
  proposeList(description: string, language?: string): Promise<AIProviderResult>;
  proposeWorkflow(description: string, language?: string): Promise<AIProviderResult>;
  proposeApp?(description: string, language?: string): Promise<AIProviderResult>;
  report(prompt: string, context: AIContext): Promise<AIProviderResult>;
  suggestMetadata(text: string, fields: AIMetadataFieldHint[]): Promise<AIProviderResult>;
}

export interface AIMetadataFieldHint {
  name: string;
  slug: string;
  type: string;
  options?: { value: string; label: string }[] | null;
}

export interface AIContext {
  organizationId: string;
  userId: string;
  userName: string;
  capabilities: Set<string>;
  language?: string;
}

export interface AIProviderResult {
  content: string;
  actionType?: string;
  actionData?: unknown;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

// Cost limits per organization (in USD cents) — configurable per provider
export const AI_COST_LIMITS = {
  dailyLimitUsd: 10.0,
  perRequestLimitUsd: 0.50
} as const;

// Rate limits
export const AI_RATE_LIMITS = {
  maxRequestsPerMinute: 20,
  maxTokensPerRequest: 8000
} as const;
