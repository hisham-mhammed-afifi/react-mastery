# Part 3, Chapter 8: Styling Strategies

## What You Will Learn

- Compare CSS Modules, Tailwind CSS, and CSS-in-JS on the axes of performance, developer experience, and server-component compatibility
- Apply Tailwind CSS patterns in React using the `cn` utility, class-variance-authority (CVA) for component variants, and `tailwind-merge` for conflict resolution
- Explain why runtime CSS-in-JS (styled-components, Emotion) is declining and identify zero-runtime alternatives
- Implement a theme system using CSS custom properties with light/dark mode, localStorage persistence, and flash-of-incorrect-theme prevention
- Apply responsive design patterns in React using container queries, media queries, and the `useMediaQuery` hook
- Choose between CSS transitions and animation libraries (Framer Motion) based on interaction complexity
- Build a complete dark mode toggle with theme persistence and system-preference detection

---

## 8.1 CSS Modules: Scoped Styles Without Runtime Cost

CSS Modules are standard CSS files where class names are automatically scoped to the component that imports them. The build tool (Vite, webpack) transforms each class name into a unique hash, preventing collisions across the application.

```css
/* ProductCard.module.css */
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  transition: box-shadow 0.25s ease;
}

.card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.price {
  color: var(--primary);
  font-size: 1.1rem;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: var(--accent);
  color: white;
}
```

```javascript
import styles from "./ProductCard.module.css";

function ProductCard({ product }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{product.name}</h3>
      <span className={styles.price}>${product.price.toFixed(2)}</span>
      {product.onSale && <span className={styles.badge}>Sale</span>}
    </div>
  );
}
```

### Advantages

- **Zero runtime cost.** Styles are extracted to static CSS at build time. No JavaScript executes at runtime to apply styles.
- **Scoping without naming conventions.** No need for BEM or other manual naming strategies; the build tool handles uniqueness.
- **Full CSS support.** Media queries, pseudo-elements, animations, `@supports`, and container queries work identically to standard CSS.
- **Server-component compatible.** CSS Modules work with React Server Components because they produce static CSS files, not runtime JavaScript.

### Limitations

- **No dynamic styles based on props.** Conditional class application requires explicit class toggling. Dynamic values (computed colors, positions) require CSS variables or inline styles.
- **Verbose conditional classes.** Multiple conditional classes require manual string concatenation or a utility like `clsx`.

```javascript
import styles from "./Button.module.css";
import clsx from "clsx";

function Button({ variant = "primary", size = "md", disabled, children }) {
  const className = clsx(
    styles.button,
    styles[variant],      // styles.primary or styles.secondary
    styles[size],          // styles.sm, styles.md, styles.lg
    disabled && styles.disabled
  );

  return (
    <button className={className} disabled={disabled}>
      {children}
    </button>
  );
}
```

---

## 8.2 Tailwind CSS + React: Patterns and Organization

Tailwind CSS applies styles through utility classes directly in JSX. Instead of writing CSS in a separate file, classes like `px-4`, `text-lg`, and `bg-blue-500` are composed in the `className` attribute.

```javascript
function ProductCard({ product }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6 transition-shadow hover:shadow-lg">
      <h3 className="text-xl font-bold mb-2">{product.name}</h3>
      <span className="text-violet-600 text-lg">${product.price.toFixed(2)}</span>
      {product.onSale && (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white ml-2">
          Sale
        </span>
      )}
    </div>
  );
}
```

### The `cn` Utility (clsx + tailwind-merge)

The `cn` function, popularized by shadcn/ui, combines `clsx` (conditional class logic) with `tailwind-merge` (intelligent Tailwind class deduplication):

```javascript
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Usage: resolves Tailwind conflicts correctly
cn("px-4 py-2", "px-6"); // "py-2 px-6" (px-6 wins over px-4)
cn("text-red-500", false && "text-blue-500"); // "text-red-500"
cn("rounded", undefined, "shadow"); // "rounded shadow"
```

### Class Variance Authority (CVA) for Component Variants

CVA provides a declarative API for defining component variants with Tailwind:

```javascript
import { cva } from "class-variance-authority";

const buttonVariants = cva(
  // Base classes (always applied)
  "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

function Button({ variant, size, className, children, ...props }) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}

// Usage
<Button variant="danger" size="lg">Delete Account</Button>
<Button variant="ghost" className="mt-4">Cancel</Button>
```

CVA generates the correct class string based on the variant props, and `cn` merges any additional classes the consumer provides. This is the pattern used by shadcn/ui for all of its components.

> **Common Mistake:** Defining CVA variants inside the component function body. Because `cva(...)` creates a new function on every call, placing it inside the component causes unnecessary recreation on each render. Define CVA variants at module scope (outside the component) where they are created once.

---

## 8.3 CSS-in-JS: styled-components, Emotion (Tradeoffs and When to Use)

Runtime CSS-in-JS libraries like styled-components and Emotion gained popularity because they colocated styles with components, supported dynamic styling based on props, and provided automatic scoping.

```javascript
// styled-components pattern (for reference; not recommended for new projects)
import styled from "styled-components";

const Card = styled.div`
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 12px;
  padding: 1.5rem;
  background: ${(props) => props.$highlighted ? props.theme.accent : props.theme.surface};

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }
`;
```

### Why Runtime CSS-in-JS Is Declining

**Performance overhead.** Every render involves serializing styles to CSS strings and injecting new `<style>` tags into the document. For a component that re-renders 100 times, this means 100 serialization operations. Benchmarks show runtime CSS-in-JS adds 2-5ms per component mount compared to static CSS.

**Server Component incompatibility.** Runtime CSS-in-JS relies on React Context for theme propagation and the browser DOM for style injection. React Server Components cannot use Context or interact with the browser, making these libraries incompatible with the server-first architecture that React 19 promotes.

**Maintenance mode.** styled-components was moved to maintenance mode in early 2024, receiving only critical bug fixes. The React APIs it depends on are being deprecated, with no upgrade path announced.

### Zero-Runtime Alternatives

| Library | Approach | Bundle Impact |
|---------|----------|---------------|
| **vanilla-extract** | TypeScript-authored styles, extracted at build time | Zero runtime |
| **Panda CSS** | Type-safe utility CSS-in-JS, extracted at build time | Zero runtime |
| **Linaria** | Tagged template literals, extracted at build time | Zero runtime |
| **CSS Modules** | Standard CSS with scoped class names | Zero runtime |
| **Tailwind CSS** | Utility classes in markup | Zero runtime |

### When Runtime CSS-in-JS Is Still Acceptable

- **Existing codebases** that are heavily invested in styled-components or Emotion. Migration is expensive and often unnecessary if the application does not use Server Components.
- **Highly dynamic styles** that depend on runtime values not expressible as CSS variables (e.g., styles computed from user-generated data, physics-based animations).
- **Component libraries** that must support theming without requiring the consumer to install a specific CSS framework.

For new projects in 2025, the recommendation is Tailwind for utility-first styling, CSS Modules for traditional CSS workflows, or vanilla-extract/Panda CSS for teams that want the CSS-in-JS authoring experience without runtime cost.

---

## 8.4 CSS Variables for Theming (Light/Dark Mode)

CSS custom properties (variables) provide a natural theming layer. Define color tokens as variables on a root element, then override them for different themes:

```css
/* theme.css */
:root {
  --bg: #fafaf9;
  --surface: #ffffff;
  --primary: #6d5ae6;
  --text: #1e1e2e;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --code-bg: #f3f0ff;
}

[data-theme="dark"] {
  --bg: #0f0f14;
  --surface: #1a1a24;
  --primary: #a78bfa;
  --text: #e4e4e7;
  --text-muted: #9ca3af;
  --border: #2d2d3a;
  --code-bg: #1e1b2e;
}

body {
  background-color: var(--bg);
  color: var(--text);
  transition: background-color 0.3s ease, color 0.3s ease;
}
```

### The React Theme Provider

```javascript
import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

function getInitialTheme() {
  // 1. Check localStorage for saved preference
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;

  // 2. Fall back to system preference
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    // Apply theme to the DOM
    document.documentElement.setAttribute("data-theme", theme);
    // Persist to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(e) {
      // Only update if user has not explicitly chosen a theme
      if (!localStorage.getItem("theme")) {
        setTheme(e.matches ? "dark" : "light");
      }
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

### Preventing the Flash of Incorrect Theme

When a server-rendered or statically built page loads, it initially renders with the default theme. JavaScript then hydrates, reads `localStorage`, and applies the correct theme. Between the initial render and hydration, the user sees a brief flash of the wrong theme.

The solution is a blocking `<script>` in the `<head>` that runs before any HTML is painted:

```html
<head>
  <script>
    (function() {
      var theme = localStorage.getItem("theme");
      if (!theme) {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      document.documentElement.setAttribute("data-theme", theme);
    })();
  </script>
</head>
```

This script executes synchronously before the browser paints, ensuring the correct CSS variables are active from the first frame. `localStorage.getItem` is synchronous and takes approximately 12 microseconds, so the blocking cost is negligible.

> **Common Mistake:** Initializing theme state from `localStorage` inside a `useEffect` instead of in the `useState` initializer. Because `useEffect` runs after the first paint, the component renders once with the default theme (causing a flash), then re-renders with the correct theme. Using `useState(getInitialTheme)` with a blocking head script eliminates the flash entirely.

---

## 8.5 Responsive Design Patterns in React

### CSS-Based Responsiveness (Preferred)

Responsive layout is primarily a CSS concern. Tailwind's responsive prefixes and CSS media queries handle the vast majority of responsive needs without JavaScript:

```javascript
function ProductGrid({ products }) {
  return (
    // Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function DashboardLayout({ sidebar, children }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar: hidden on mobile, fixed width on desktop */}
      <aside className="hidden md:block w-64 border-r border-gray-200 p-4">
        {sidebar}
      </aside>
      <main className="flex-1 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
```

### JavaScript-Based Responsiveness (When CSS Is Not Enough)

For cases where the component structure must change based on viewport (not just layout), use a `useMediaQuery` hook:

```javascript
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    setMatches(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// Usage: render different component structures on mobile vs desktop
function Navigation() {
  const isMobile = useMediaQuery("(max-width: 639px)");

  if (isMobile) {
    return <MobileDrawerNav />;  // Hamburger + slide-out drawer
  }

  return <DesktopNav />;  // Horizontal link bar
}
```

### Container Queries

CSS container queries allow components to adapt based on their container's size rather than the viewport. This is useful for reusable components that appear in different contexts:

```css
/* ProductCard adapts to its container, not the viewport */
.product-card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .product-card {
    display: flex;
    flex-direction: row;
    gap: 1rem;
  }
}

@container (max-width: 399px) {
  .product-card {
    display: flex;
    flex-direction: column;
  }
}
```

> **See Also:** Part 3, Chapter 2, Section 2.17 for the `useMediaQuery` custom hook implementation.

---

## 8.6 Animation: CSS Transitions, Framer Motion, React Spring

### CSS Transitions: The Baseline

For simple state-driven visual changes (hover effects, color transitions, visibility toggles), CSS transitions are the most performant option:

```javascript
function CollapsiblePanel({ title, children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 text-left font-semibold flex justify-between items-center hover:bg-gray-50 transition-colors"
      >
        {title}
        <span
          className="transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </button>
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isOpen ? "500px" : "0",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

### Framer Motion (Motion): Declarative Animations for React

Framer Motion (now "Motion") provides a React-native animation API with spring physics, exit animations, and layout animations:

```javascript
import { motion, AnimatePresence } from "framer-motion";

function NotificationList({ notifications, onDismiss }) {
  return (
    <div className="notification-stack">
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            // Enter animation
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            // Exit animation (AnimatePresence delays removal)
            exit={{ opacity: 0, x: 100, height: 0 }}
            // Spring physics for natural motion
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="notification"
          >
            <p>{notif.message}</p>
            <button onClick={() => onDismiss(notif.id)}>Dismiss</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

### Layout Animations

The `layout` prop automatically animates any size or position change caused by React state updates:

```javascript
function FilterableGrid({ items, filter }) {
  const visible = items.filter((item) =>
    filter === "all" || item.category === filter
  );

  return (
    <div className="grid grid-cols-3 gap-4">
      {visible.map((item) => (
        <motion.div
          key={item.id}
          layout // Automatically animates position when items are filtered
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="card"
        >
          {item.name}
        </motion.div>
      ))}
    </div>
  );
}
```

### When to Use Each

| Scenario | Approach |
|----------|----------|
| Hover/focus effects | CSS transitions |
| Color/opacity changes | CSS transitions |
| Simple fade-in on mount | CSS `@keyframes` or `transition` |
| Exit animations (unmount) | Framer Motion `AnimatePresence` |
| Spring physics | Framer Motion (spring transitions) |
| Layout/reorder animations | Framer Motion `layout` prop |
| Gesture-driven (drag, swipe) | Framer Motion gesture handlers |
| Staggered list animations | Framer Motion variants with `staggerChildren` |
| Page transitions | Framer Motion with React Router |

### Reducing Framer Motion Bundle Size

```javascript
// Full import: ~30 kB
import { motion, AnimatePresence } from "framer-motion";

// Lazy import: ~15 kB (loads features on demand)
import { LazyMotion, domAnimation, m } from "framer-motion";

function App() {
  return (
    <LazyMotion features={domAnimation}>
      <m.div animate={{ opacity: 1 }}>Lighter bundle</m.div>
    </LazyMotion>
  );
}
```

---

## 8.7 Exercise: Implement a Theme System with Dark Mode Toggle

### Problem Statement

Build a complete theme system that supports light, dark, and system-preference modes. Requirements: CSS variables for all colors, a three-way toggle (light/dark/system), localStorage persistence, flash prevention via blocking script, and smooth transitions.

### Solution

```css
/* styles/theme.css */
:root {
  --bg: #fafaf9;
  --surface: #ffffff;
  --primary: #6d5ae6;
  --primary-hover: #5b48d4;
  --text: #1e1e2e;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --shadow: 0 4px 24px rgba(109, 90, 230, 0.08);
}

[data-theme="dark"] {
  --bg: #0f0f14;
  --surface: #1a1a24;
  --primary: #a78bfa;
  --primary-hover: #c4b5fd;
  --text: #e4e4e7;
  --text-muted: #9ca3af;
  --border: #2d2d3a;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

body {
  background-color: var(--bg);
  color: var(--text);
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* All themed elements transition smoothly */
*, *::before, *::after {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
```

```html
<!-- index.html: blocking script in <head> prevents flash -->
<head>
  <script>
    (function() {
      var mode = localStorage.getItem("theme-mode"); // "light", "dark", or "system"
      var theme;

      if (mode === "light" || mode === "dark") {
        theme = mode;
      } else {
        // System preference or no stored preference
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark" : "light";
      }

      document.documentElement.setAttribute("data-theme", theme);
    })();
  </script>
</head>
```

```javascript
// hooks/useThemeMode.js
import { createContext, useContext, useState, useEffect, useMemo } from "react";

const ThemeModeContext = createContext(null);

function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  // "system" mode: check media query
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getInitialMode() {
  const stored = localStorage.getItem("theme-mode");
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);
  const resolvedTheme = resolveTheme(mode);

  // Apply theme to DOM and persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    localStorage.setItem("theme-mode", mode);
  }, [mode, resolvedTheme]);

  // Listen for system preference changes (relevant when mode is "system")
  useEffect(() => {
    if (mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const newTheme = mediaQuery.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", newTheme);
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode requires ThemeModeProvider");
  return ctx;
}

// components/ThemeSwitcher.js
function ThemeSwitcher() {
  const { mode, setMode } = useThemeMode();

  const modes = [
    { value: "light", label: "Light", icon: "☀️" },
    { value: "dark", label: "Dark", icon: "🌙" },
    { value: "system", label: "System", icon: "💻" },
  ];

  return (
    <div
      className="flex rounded-lg overflow-hidden border"
      style={{ borderColor: "var(--border)" }}
      role="radiogroup"
      aria-label="Theme selection"
    >
      {modes.map(({ value, label, icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className="px-3 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: mode === value ? "var(--primary)" : "var(--surface)",
            color: mode === value ? "white" : "var(--text)",
          }}
        >
          <span aria-hidden="true">{icon}</span> {label}
        </button>
      ))}
    </div>
  );
}

// App.js
function App() {
  return (
    <ThemeModeProvider>
      <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
        <header
          className="flex justify-between items-center p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text)" }}
          >
            Theme Demo
          </h1>
          <ThemeSwitcher />
        </header>
        <main className="p-8">
          <ThemedCard />
        </main>
      </div>
    </ThemeModeProvider>
  );
}

function ThemedCard() {
  const { resolvedTheme } = useThemeMode();

  return (
    <div
      className="rounded-xl p-6 max-w-md mx-auto"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
      }}
    >
      <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>
        Themed Card
      </h2>
      <p style={{ color: "var(--text-muted)" }}>
        Current theme: {resolvedTheme}. All colors transition smoothly
        between themes using CSS custom properties.
      </p>
      <button
        className="mt-4 px-4 py-2 rounded-lg font-semibold text-white transition-colors"
        style={{
          backgroundColor: "var(--primary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--primary-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--primary)";
        }}
      >
        Primary Button
      </button>
    </div>
  );
}
```

### Architecture Decisions

| Decision | Reasoning |
|----------|-----------|
| Three-way toggle (light/dark/system) | Respects user preference while allowing explicit override |
| CSS variables for all colors | Single source of truth; no JavaScript needed for color resolution |
| Blocking head script | Prevents flash of incorrect theme on page load |
| `data-theme` attribute on `<html>` | Cascades to all elements; compatible with any CSS framework |
| `localStorage` for persistence | Synchronous read; survives page refreshes and browser restarts |
| System preference listener | Updates automatically when OS theme changes (in system mode) |
| `transition` on all elements | Smooth visual transition when switching themes |

### Key Takeaway

A production theme system requires three layers: CSS variables for color definitions (the source of truth), a blocking head script for flash prevention (the first-paint guarantee), and a React context for interactive toggling (the runtime control). CSS variables handle the rendering; React handles the interaction. Separating these concerns ensures that theming works correctly even before React hydrates, and the transition between themes is visually smooth.

---

## Chapter Summary

React styling in 2025 favors zero-runtime approaches: Tailwind CSS for utility-first workflows (with CVA for variants and `cn` for class merging), CSS Modules for scoped traditional CSS, and vanilla-extract/Panda CSS for teams wanting CSS-in-JS ergonomics without runtime cost. Runtime CSS-in-JS (styled-components, Emotion) is in decline due to performance overhead and Server Component incompatibility. CSS custom properties provide the theming layer for light/dark mode, with a blocking head script to prevent the flash of incorrect theme. Responsive design should be handled in CSS (media queries, container queries, Tailwind breakpoint prefixes), reserving JavaScript (`useMediaQuery`) for cases where the component structure must change. Animation follows a similar escalation: CSS transitions for simple effects, Framer Motion for exit animations, spring physics, layout animations, and gesture interactions.

## Further Reading

- [CSS in React Server Components (Josh Comeau)](https://www.joshwcomeau.com/react/css-in-rsc/) — why runtime CSS-in-JS is incompatible with RSC
- [The Quest for the Perfect Dark Mode (Josh Comeau)](https://www.joshwcomeau.com/react/dark-mode/) — the definitive flash prevention guide
- [CVA Documentation](https://cva.style/docs) — class-variance-authority for component variants
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) — utility-first CSS framework reference
- [Motion for React (Framer Motion)](https://motion.dev/docs/react) — declarative animation library documentation
- [CSS Modules (Vite Documentation)](https://vite.dev/guide/features#css-modules) — how CSS Modules work in modern build tools
