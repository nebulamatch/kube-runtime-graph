const DEFAULT_BACKEND_URL = 'http://localhost:3001';

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;

export const apiUrl = (path: string) => `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const socketUrl = BACKEND_URL;
