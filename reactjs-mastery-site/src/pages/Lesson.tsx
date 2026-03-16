import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLessonContent } from "../hooks/useLessonContent";
import { useLessons } from "../hooks/useLessons";
import MarkdownRenderer from "../components/MarkdownRenderer";
import ThemeToggle from "../components/ThemeToggle";

export default function Lesson() {
  const { slug } = useParams<{ slug: string }>();
  const { content, loading, error } = useLessonContent(slug);
  const { lessons } = useLessons();
  const [fadeIn, setFadeIn] = useState(false);

  const currentIndex = lessons.findIndex((l) => l.slug === slug);
  const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

  const title = content.match(/^#\s+(.+)$/m)?.[1] ?? slug ?? "Lesson";

  useEffect(() => {
    document.title = `${title} | React.js Mastery`;
    window.scrollTo(0, 0);
    setFadeIn(false);
    requestAnimationFrame(() => setFadeIn(true));
  }, [title, slug]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Sticky Nav */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold no-underline"
          style={{
            color: "var(--primary)",
            fontFamily: '"Outfit", sans-serif',
            transition: "opacity 0.25s ease",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          All Chapters
        </Link>

        <span
          className="hidden sm:block text-sm font-medium truncate max-w-md px-4"
          style={{
            color: "var(--text-muted)",
            fontFamily: '"Outfit", sans-serif',
          }}
        >
          {title}
        </span>

        <ThemeToggle />
      </nav>

      {/* Content */}
      <main
        id="main-content"
        className="px-4 sm:px-6 py-10"
        style={{
          opacity: fadeIn ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--primary)",
              }}
            />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <h2
              className="text-2xl font-bold mb-4"
              style={{ fontFamily: '"Outfit", sans-serif', color: "var(--text)" }}
            >
              Lesson Not Found
            </h2>
            <Link
              to="/"
              className="font-semibold"
              style={{ color: "var(--primary)" }}
            >
              Back to all chapters
            </Link>
          </div>
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </main>

      {/* Bottom Nav */}
      {!loading && !error && (
        <nav
          className="max-w-[720px] mx-auto px-4 pb-12 flex justify-between gap-4"
          style={{ borderTop: "1px solid var(--border)", paddingTop: "2rem" }}
        >
          {prevLesson ? (
            <Link
              to={`/lesson/${prevLesson.slug}`}
              className="flex items-center gap-2 text-sm font-semibold no-underline px-4 py-2 rounded-lg"
              style={{
                color: "var(--primary)",
                backgroundColor: "var(--code-bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                transition:
                  "background-color 0.25s ease, transform 0.25s ease",
                fontFamily: '"Outfit", sans-serif',
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateX(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Previous
            </Link>
          ) : (
            <div />
          )}

          {nextLesson ? (
            <Link
              to={`/lesson/${nextLesson.slug}`}
              className="flex items-center gap-2 text-sm font-semibold no-underline px-4 py-2 rounded-lg"
              style={{
                color: "white",
                backgroundColor: "var(--primary)",
                borderRadius: 8,
                transition:
                  "background-color 0.25s ease, transform 0.25s ease",
                fontFamily: '"Outfit", sans-serif',
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateX(2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              Next
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </div>
  );
}
