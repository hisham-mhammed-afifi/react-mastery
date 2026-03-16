import { useLessons } from "../hooks/useLessons";
import { useSEO } from "../hooks/useSEO";
import LessonCard from "../components/LessonCard";
import ThemeToggle from "../components/ThemeToggle";
import { useEffect, useState } from "react";

export default function Home() {
  const { lessons, loading } = useLessons();
  const [heroVisible, setHeroVisible] = useState(false);

  useSEO({
    title: "React.js Mastery: From Mid-Level to Senior and Beyond",
    description:
      "A comprehensive, book-quality guide to JavaScript foundations and React expertise. 11 chapters covering closures, prototypes, async patterns, design patterns, and more.",
    path: "/",
  });

  useEffect(() => {
    requestAnimationFrame(() => setHeroVisible(true));
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
          padding: "5rem 1.5rem 4rem",
        }}
      >
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        <div
          className="max-w-3xl mx-auto text-center"
          style={{
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? "translateY(0)" : "translateY(24px)",
            transition:
              "opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* React atom icon */}
          <div className="mb-6">
            <svg
              width="64"
              height="64"
              viewBox="0 0 100 100"
              className="mx-auto"
            >
              <circle cx="50" cy="50" r="10" fill="white" opacity="0.9" />
              <ellipse
                cx="50"
                cy="50"
                rx="40"
                ry="16"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                opacity="0.7"
              />
              <ellipse
                cx="50"
                cy="50"
                rx="40"
                ry="16"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                opacity="0.7"
                transform="rotate(60 50 50)"
              />
              <ellipse
                cx="50"
                cy="50"
                rx="40"
                ry="16"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                opacity="0.7"
                transform="rotate(120 50 50)"
              />
            </svg>
          </div>

          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4"
            style={{
              fontFamily: '"Outfit", sans-serif',
              letterSpacing: "-0.03em",
              textShadow: "0 2px 12px rgba(0,0,0,0.15)",
            }}
          >
            React.js Mastery
          </h1>
          <p
            className="text-lg md:text-xl mb-8"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            From mid-level to senior and beyond. A comprehensive, book-quality
            guide to JavaScript foundations and React expertise.
          </p>
          <a
            href="#lessons"
            className="inline-block px-8 py-3 font-bold rounded-lg text-base"
            style={{
              backgroundColor: "white",
              color: "var(--primary)",
              borderRadius: 8,
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              textDecoration: "none",
              fontFamily: '"Outfit", sans-serif',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
          >
            Start Learning
          </a>
        </div>
      </section>

      {/* Lessons Grid */}
      <main
        id="lessons"
        className="max-w-6xl mx-auto px-4 py-12"
        style={{ scrollMarginTop: "2rem" }}
      >
        <h2
          className="text-2xl md:text-3xl font-bold mb-8 text-center"
          style={{
            fontFamily: '"Outfit", sans-serif',
            color: "var(--text)",
          }}
        >
          Chapters
        </h2>

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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {lessons.map((lesson) => (
              <LessonCard
                key={lesson.slug}
                lesson={lesson}
                delay={lesson.index * 50}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="text-center py-8 text-sm"
        style={{
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border)",
        }}
      >
        The React Mastery Guide
      </footer>
    </div>
  );
}
