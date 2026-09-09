import { list } from '@vercel/blob';

export const config = { runtime: 'nodejs' };

const BLOB_KEY = 'fcmonitor_config';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (blobs.length === 0) {
      return res.status(200).json({ tokens: {} });
    }

    const response = await fetch(blobs[0].url);
    const data = await response.json();

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Dashboard Config] Error:', error);
    return res.status(200).json({ tokens: {} });
  }
}
