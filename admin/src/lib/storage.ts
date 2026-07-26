import { useState, useEffect } from "react";
import { supabase } from "./supabase";

/**
 * Buckets that are private — must use signed URLs instead of public URLs.
 */
const PRIVATE_BUCKETS = new Set([
  "contracts",
  "email-template-attachments",
  "email-attachments-cache",
  "project-files",
  "job-applications",
  "sales-opportunity-files",
]);

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Get a URL for a storage file. Uses public URL for public buckets,
 * signed URL for private buckets.
 *
 * If `downloadFilename` is provided, the returned URL will force the browser
 * to download the file (Content-Disposition: attachment) using that exact
 * filename instead of whatever the storage path looks like — useful for
 * customer-facing PDFs where the storage path contains a UUID.
 */
export async function getStorageFileUrl(
  bucket: string,
  path: string,
  opts: { downloadFilename?: string } = {},
): Promise<string | null> {
  const { downloadFilename } = opts;
  if (PRIVATE_BUCKETS.has(bucket)) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRY, downloadFilename ? { download: downloadFilename } : undefined);
    return data?.signedUrl ?? null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, downloadFilename ? { download: downloadFilename } : undefined);
  return data?.publicUrl ?? null;
}

/**
 * React hook: resolve a single file URL (handles private buckets).
 */
export function useStorageUrl(
  bucket: string | undefined,
  path: string | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bucket || !path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getStorageFileUrl(bucket, path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  return url;
}

/**
 * React hook: resolve URLs for a list of files (handles private buckets).
 * Returns a map of file id → url.
 */
export function useStorageUrls<T extends { id: string; bucket: string; path: string }>(
  files: T[],
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (files.length === 0) {
      setUrls({});
      return;
    }

    let cancelled = false;

    Promise.all(
      files.map(async (f) => {
        const url = await getStorageFileUrl(f.bucket, f.path);
        return [f.id, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (url) map[id] = url;
      }
      setUrls(map);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map((f) => `${f.id}:${f.bucket}:${f.path}`).join("|")]);

  return urls;
}
