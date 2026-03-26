export async function callOllama(
  model: string,
  baseUrl: string,
  systemMessage: string,
  userMessage: string,
  temperature: number,
): Promise<string> {
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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { message: { content: string } };
  return data.message.content;
}
