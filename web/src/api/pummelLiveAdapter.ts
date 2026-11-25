// Live Axum Telemetry Adapter for PyCentric Pummel Load Engine (zero Gemini / zero CDN).
export interface PummelLiveMetrics {
  active_vus: number;
  rps: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  error_rate_pct: number;
  status: 'idle' | 'running' | 'completed';
}

export async function fetchPummelMetrics(baseUrl = ''): Promise<PummelLiveMetrics | null> {
  try {
    const resp = await fetch(`${baseUrl}/api/v1/metrics`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) return null;
    return (await resp.json()) as PummelLiveMetrics;
  } catch {
    return null;
  }
}

export async function triggerPummelScenario(scenarioPath: string, baseUrl = ''): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: scenarioPath }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
