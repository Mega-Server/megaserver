const BASE_URL = import.meta.env.VITE_API_URL;

export const api = {
  post: async <T>(path: string): Promise<T> => {
    const resp = await fetch(`${BASE_URL}${path}`, { method: "POST" });
    if (!resp.ok) throw new Error(`Request failed: ${path}`);
    return resp.json();
  },
  get: async <T>(path: string): Promise<T> => {
    const resp = await fetch(`${BASE_URL}${path}`);
    if (!resp.ok) throw new Error(`Request failed: ${path}`);
    return resp.json();
  },
};
