export function aiConfig(env) {
  if (env.GEMINI_API_KEY?.trim()) return {
    enabled: true, provider: 'google', model: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  };
  return {
    enabled: !!(env.CF_ACCOUNT_ID && env.CF_AI_TOKEN),
    provider: 'cloudflare', model: env.CF_AI_MODEL || 'google/gemini-4-argon',
  };
}

export async function requestTeacher(env, fetcher, request) {
  const config = aiConfig(env);
  if (config.provider === 'google') {
    const input = {
      contents: request.input.contents,
      systemInstruction: request.input.systemInstruction,
      generationConfig: {responseMimeType: 'application/json', maxOutputTokens: 4096},
    };
    const response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: {'x-goog-api-key': env.GEMINI_API_KEY.trim(), 'Content-Type': 'application/json'},
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok) {
      const message = response.status === 429
        ? 'Google AI usage limit reached. Please try again later; ordinary answer checking is still available.'
        : [401, 403].includes(response.status)
          ? 'Google AI could not authenticate. Check the Gemini key and its API access in Vercel.'
          : response.status === 404
            ? 'The selected Gemini model is unavailable. Check GEMINI_MODEL in Vercel.'
            : 'Google AI is temporarily unavailable. Please try again later.';
      throw Object.assign(new Error(message), {status: response.status === 429 ? 429 : 503});
    }
    return response;
  }
  return fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/ai/run`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(25000),
  });
}
