export const bad = (error: string, status = 400) => Response.json({ error }, { status });
