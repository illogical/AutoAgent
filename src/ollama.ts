import { getLogger } from './logger.js';

export async function callOllama(
  model: string,
  baseUrl: string,
  systemMessage: string,
  userMessage: string,
  temperature: number,
): Promise<string> {
  const logger = getLogger();
  const url = `${baseUrl}/api/chat`;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    options: { temperature },
  };

  logger.debug('Ollama request', {
    model,
    baseUrl,
    temperature,
    systemMessageLength: systemMessage.length,
    userMessageLength: userMessage.length,
    systemMessagePreview: systemMessage.slice(0, 200),
  });

  const start = performance.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`Ollama API error ${response.status}`, { model, status: response.status, responseText: text });
    throw new Error(`Ollama API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { message: { content: string } };
  const content = data.message.content;
  const durationMs = Math.round(performance.now() - start);

  logger.info(`Ollama response received`, { model, responseLength: content.length, durationMs });
  logger.debug('Ollama response content', { model, content });

  return content;
}
