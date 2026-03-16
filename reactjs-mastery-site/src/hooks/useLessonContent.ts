import { useState, useEffect } from "react";

export function useLessonContent(slug: string | undefined) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(false);
        const res = await fetch(`/content/${slug}.md`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Not found");
        const text = await res.text();
        setContent(text);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(true);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [slug]);

  return { content, loading, error };
}
