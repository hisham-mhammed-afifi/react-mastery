import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { LessonMeta } from "../hooks/useLessons";

const BADGE_COLORS = [
  "#6D5AE6",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#06B6D4",
];

interface LessonCardProps {
  lesson: LessonMeta;
  delay: number;
}

export default function LessonCard({ lesson, delay }: LessonCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const badgeColor = BADGE_COLORS[lesson.index % BADGE_COLORS.length];

  return (
    <Link
      ref={ref}
      to={`/lesson/${lesson.slug}`}
      className="block no-underline"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
      }}
    >
      <div
        className="group relative rounded-xl p-6 h-full"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          borderLeft: `4px solid ${badgeColor}`,
          transition:
            "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = "var(--shadow-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "var(--shadow)";
        }}
      >
        <div className="flex items-start gap-3 mb-3">
          <span
            className="shrink-0 inline-flex items-center justify-center text-white text-xs font-bold"
            style={{
              backgroundColor: badgeColor,
              width: 28,
              height: 28,
              borderRadius: 20,
            }}
          >
            {lesson.index + 1}
          </span>
          <h3
            className="text-base font-bold leading-tight"
            style={{
              fontFamily: '"Outfit", sans-serif',
              color: "var(--text)",
            }}
          >
            {lesson.title}
          </h3>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {lesson.preview}...
        </p>
      </div>
    </Link>
  );
}
