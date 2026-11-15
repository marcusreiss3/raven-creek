export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.form ? undefined : { 'Content-Type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  return data as T;
}

/** Caminho de asset com fallback: se o arquivo não existir, o componente troca para o placeholder. */
export const sceneUrl = (key: string) => `/assets/scenes/${key}.png`;
export const arenaUrl = (key: string) => `/assets/arenas/${key}.png`;
export const portraitUrl = (p: string | null | undefined) => p || '/assets/portraits/default.png';
