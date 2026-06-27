const DEFAULT_BACKEND_URL = ''; // Default to relative path to hit Next.js rewrites

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;

export const apiUrl = (path: string) => `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;

// socket.io-client will use window.location if the URL is empty/undefined
export const socketUrl = BACKEND_URL || undefined;

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(apiUrl(`/api${path}`), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `API error: ${res.statusText}`);
  }
  return res.json();
};
