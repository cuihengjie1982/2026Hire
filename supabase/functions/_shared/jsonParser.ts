export function parseJSONResponse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { /* */ }
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[1].trim()); } catch { /* */ } }
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* */ } }
  return { totalScore: 0, error: 'Failed to parse structured response', rawResponse: raw.slice(0, 1000) };
}
