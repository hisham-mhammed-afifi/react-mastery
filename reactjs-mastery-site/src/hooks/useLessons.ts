import { useState, useEffect } from "react";

export interface LessonMeta {
  slug: string;
  filename: string;
  title: string;
  preview: string;
  index: number;
}

export function useLessons() {
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/content-manifest.json", {
          signal: controller.signal,
        });
        const files: string[] = await res.json();

        const lessonFiles = files.filter(
          (f) => f.startsWith("part") && f.endsWith(".md")
        );

        const metas: LessonMeta[] = await Promise.all(
          lessonFiles.map(async (filename, index) => {
            const mdRes = await fetch(`/content/${filename}`, {
              signal: controller.signal,
            });
            const text = await mdRes.text();

            const titleMatch = text.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : filename;

            const contentStart = text.indexOf("\n", text.indexOf("# "));
            const previewText = text
              .slice(contentStart)
              .replace(/[#*>`\-\[\]|_]/g, "")
              .replace(/\n+/g, " ")
              .trim()
              .slice(0, 120);

            const slug = filename.replace(".md", "");

            return { slug, filename, title, preview: previewText, index };
          })
        );

        setLessons(metas);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to load lessons:", err);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return { lessons, loading };
}
