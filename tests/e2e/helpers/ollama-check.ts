const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

export async function assertOllamaReady(requiredModels: string[]): Promise<void> {
  let tags: { models: { name: string }[] };
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tags = await res.json() as { models: { name: string }[] };
  } catch (err) {
    throw new Error(
      `Ollama is not reachable at ${OLLAMA_BASE_URL}: ${err instanceof Error ? err.message : String(err)}. ` +
      `Start it with: ollama serve`,
    );
  }

  const available = new Set(tags.models.map(m => m.name.split(':')[0]));
  const missing = requiredModels.filter(m => !available.has(m.split(':')[0]));
  if (missing.length > 0) {
    throw new Error(
      `Missing Ollama models: ${missing.join(', ')}. ` +
      `Pull them with: ${missing.map(m => `ollama pull ${m}`).join(' && ')}`,
    );
  }
}
