import { supabase } from './supabase';

export interface AiAnalysisResult {
  identified: boolean;
  title: string;
  category: string;
  brand: string | null;
  era: string | null;
  condition_estimate: string;
  rarity_score: number;
  confidence: number;
  estimated_value: { low: number; high: number; currency: string };
  summary: string;
  highlights: string[];
  selling_tips: string[];
  watch_outs: string[];
}

export interface AiScanResponse {
  result: AiAnalysisResult;
  cached: boolean;
  tier: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
}

export interface AiScanUsage {
  tier: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
}

export class AiScanError extends Error {
  status: number;
  usage?: { tier: 'free' | 'pro'; used: number; limit: number; remaining: number };
  constructor(message: string, status: number, usage?: AiScanError['usage']) {
    super(message);
    this.status = status;
    this.usage = usage;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function fetchAiScanUsage(): Promise<AiScanUsage | null> {
  try {
    const headers = await authHeader();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/ai-scan/usage', { headers });
    if (!res.ok) return null;
    return (await res.json()) as AiScanUsage;
  } catch {
    return null;
  }
}

export async function runAiScan(
  compressedDataUrl: string,
  context?: string,
): Promise<AiScanResponse> {
  const headers = await authHeader();
  if (!headers.Authorization) {
    throw new AiScanError('Create a free account to use AI Treasure Scan.', 401);
  }
  const res = await fetch('/api/ai-scan', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: compressedDataUrl, context: context ?? '' }),
  });

  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new AiScanError(
      body?.error || 'AI scan failed. Please try again.',
      res.status,
      body?.tier
        ? { tier: body.tier, used: body.used, limit: body.limit, remaining: body.remaining }
        : undefined,
    );
  }
  return body as AiScanResponse;
}
