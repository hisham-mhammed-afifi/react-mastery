# Part 4, Chapter 8: Design System Architecture

## What You Will Learn

- Define the four layers of a design system (tokens, base components, patterns, and guidelines) and explain how each layer builds on the one below it
- Implement a three-tier design token architecture (primitive, semantic, component) using CSS custom properties that support runtime theme switching without recompilation
- Design component APIs that use variants, sizes, and compound props to balance flexibility with consistency, using Class Variance Authority (CVA) for class management
- Build accessible base components that implement WAI-ARIA Authoring Practices for keyboard navigation, focus management, and screen reader announcements
- Apply the composition-over-configuration principle to create components that remain flexible without accumulating dozens of boolean props
- Configure Storybook for component documentation, interaction testing with play functions, and visual regression testing
- Establish a versioning and publishing workflow for a component library using Changesets and semantic versioning

---

## 8.1 What a Design System Is (Tokens, Components, Patterns, Guidelines)

A design system is a collection of reusable decisions, encoded as artifacts, that a product team uses to build consistent user interfaces. It is not merely a component library. A component library is one artifact within a design system, alongside design tokens, usage patterns, and human-readable guidelines.

### The Four Layers

```
┌──────────────────────────────────────────────┐
│              Guidelines                       │  Human documentation: when to use
│              (docs, principles, tone)         │  which pattern, writing style, etc.
├──────────────────────────────────────────────┤
│              Patterns                         │  Compositions of components:
│              (form layouts, card grids,       │  page templates, navigation flows
│               data tables)                    │
├──────────────────────────────────────────────┤
│              Components                       │  Reusable UI elements:
│              (Button, Input, Modal, Toast)    │  self-contained, accessible, themed
├──────────────────────────────────────────────┤
│              Design Tokens                    │  Atomic decisions:
│              (colors, spacing, typography,    │  the raw values everything above
│               shadows, radii)                 │  is built from
└──────────────────────────────────────────────┘
```

**Design Tokens** are the smallest decisions in a design system. A token is a named value: `color-primary-500: #3b82f6`, `spacing-4: 1rem`, `font-size-lg: 1.125rem`. Tokens provide a shared vocabulary between designers and developers. Changing a token value propagates the change to every component that references it.

**Components** are reusable UI elements built from tokens. A `Button` component consumes color tokens, spacing tokens, and typography tokens to produce a consistent interactive element. Components encapsulate accessibility behavior, keyboard interactions, and visual states.

**Patterns** are compositions of components that solve recurring UI problems. A "search with filters" pattern combines an `Input`, a `Select`, a `Button`, and a `Card` list into a cohesive interaction. Patterns are not shipped as code; they are documented as guidelines with example implementations.

**Guidelines** are the human-readable documentation that explains when and how to use tokens, components, and patterns. Guidelines cover tone of voice, spacing philosophy, responsive behavior, accessibility requirements, and decision trees for choosing between similar components.

### Why Each Layer Matters

Without tokens, teams make ad-hoc color and spacing decisions that diverge across features. Without components, teams rebuild the same button with slightly different accessibility behavior in every feature. Without patterns, teams compose components in inconsistent ways. Without guidelines, teams make different decisions about when to use a modal versus an inline expansion.

A design system succeeds when a developer can build a new feature using existing tokens, components, and patterns without inventing anything new, and when a designer can hand off a mockup knowing that the implementation will match because both sides reference the same system.

> **See Also:** Part 3, Chapter 8, Section 8.4 for CSS Variables and theming fundamentals that underpin design token implementation.

---

## 8.2 Design Tokens: Colors, Spacing, Typography, Shadows

### The Three-Tier Token Architecture

Modern design systems organize tokens into three tiers, each building on the one below it:

**Tier 1: Primitive Tokens** represent raw values with no semantic meaning. They define the palette:

```javascript
// tokens/primitives.js
// These values never appear in component code directly.
// They exist only to be referenced by semantic tokens.
export const primitives = {
  // Colors
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  gray700: '#374151',
  gray900: '#111827',
  white: '#ffffff',
  red500: '#ef4444',
  red600: '#dc2626',
  green500: '#22c55e',
  green600: '#16a34a',

  // Spacing (based on a 4px grid)
  space1: '0.25rem',   // 4px
  space2: '0.5rem',    // 8px
  space3: '0.75rem',   // 12px
  space4: '1rem',      // 16px
  space6: '1.5rem',    // 24px
  space8: '2rem',      // 32px
  space12: '3rem',     // 48px

  // Typography
  fontSizeXs: '0.75rem',    // 12px
  fontSizeSm: '0.875rem',   // 14px
  fontSizeMd: '1rem',       // 16px
  fontSizeLg: '1.125rem',   // 18px
  fontSizeXl: '1.25rem',    // 20px
  fontSize2xl: '1.5rem',    // 24px

  fontWeightNormal: '400',
  fontWeightMedium: '500',
  fontWeightSemibold: '600',
  fontWeightBold: '700',

  lineHeightTight: '1.25',
  lineHeightNormal: '1.5',
  lineHeightRelaxed: '1.75',

  // Shadows
  shadowSm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  shadowMd: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  shadowLg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',

  // Radii
  radiusSm: '0.25rem',
  radiusMd: '0.375rem',
  radiusLg: '0.5rem',
  radiusFull: '9999px',
};
```

**Tier 2: Semantic Tokens** assign meaning to primitive values. They describe purpose, not appearance:

```javascript
// tokens/semantic.js
import { primitives } from './primitives';

export const lightTheme = {
  // Surfaces
  colorBackground: primitives.white,
  colorBackgroundSubtle: primitives.gray50,
  colorBackgroundMuted: primitives.gray100,
  colorSurface: primitives.white,

  // Text
  colorText: primitives.gray900,
  colorTextSecondary: primitives.gray500,
  colorTextInverse: primitives.white,

  // Interactive
  colorPrimary: primitives.blue600,
  colorPrimaryHover: primitives.blue700,
  colorPrimarySubtle: primitives.blue50,

  // Feedback
  colorDanger: primitives.red500,
  colorDangerHover: primitives.red600,
  colorSuccess: primitives.green500,
  colorSuccessHover: primitives.green600,

  // Borders
  colorBorder: primitives.gray200,
  colorBorderFocus: primitives.blue500,

  // Shadows
  shadow: primitives.shadowMd,
  shadowElevated: primitives.shadowLg,

  // Spacing (semantic aliases)
  spaceInlineXs: primitives.space1,
  spaceInlineSm: primitives.space2,
  spaceInlineMd: primitives.space4,
  spaceInlineLg: primitives.space6,
  spaceStackSm: primitives.space2,
  spaceStackMd: primitives.space4,
  spaceStackLg: primitives.space8,
};

export const darkTheme = {
  colorBackground: primitives.gray900,
  colorBackgroundSubtle: primitives.gray700,
  colorBackgroundMuted: primitives.gray700,
  colorSurface: primitives.gray700,

  colorText: primitives.gray50,
  colorTextSecondary: primitives.gray200,
  colorTextInverse: primitives.gray900,

  colorPrimary: primitives.blue500,
  colorPrimaryHover: primitives.blue600,
  colorPrimarySubtle: '#1e3a5f',

  colorDanger: primitives.red500,
  colorDangerHover: primitives.red600,
  colorSuccess: primitives.green500,
  colorSuccessHover: primitives.green600,

  colorBorder: primitives.gray500,
  colorBorderFocus: primitives.blue500,

  shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
  shadowElevated: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',

  spaceInlineXs: primitives.space1,
  spaceInlineSm: primitives.space2,
  spaceInlineMd: primitives.space4,
  spaceInlineLg: primitives.space6,
  spaceStackSm: primitives.space2,
  spaceStackMd: primitives.space4,
  spaceStackLg: primitives.space8,
};
```

**Tier 3: Component Tokens** (optional) define values specific to a single component. They reference semantic tokens and combine them for specific component states:

```css
/* Component tokens for Button, defined in the component's CSS */
.ds-button {
  --button-bg: var(--color-primary);
  --button-bg-hover: var(--color-primary-hover);
  --button-text: var(--color-text-inverse);
  --button-padding-x: var(--space-inline-md);
  --button-padding-y: var(--space-inline-sm);
  --button-radius: var(--radius-md);

  background-color: var(--button-bg);
  color: var(--button-text);
  padding: var(--button-padding-y) var(--button-padding-x);
  border-radius: var(--button-radius);
}
```

### Implementing Tokens as CSS Custom Properties

CSS custom properties (variables) are the preferred mechanism for design tokens because they support runtime theme switching without JavaScript recompilation:

```javascript
// theme/ThemeProvider.js
import { createContext, useContext, useState, useEffect } from 'react';
import { lightTheme, darkTheme } from '../tokens/semantic';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

function applyThemeToDOM(themeObj) {
  const root = document.documentElement;
  // Convert camelCase keys to CSS custom property names.
  // colorPrimary becomes --color-primary
  for (const [key, value] of Object.entries(themeObj)) {
    const cssVarName = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVarName, value);
  }
}

export function ThemeProvider({ children, defaultTheme = 'light' }) {
  const [theme, setTheme] = useState(() => {
    // Respect the user's saved preference or system preference.
    const saved = localStorage.getItem('ds-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : defaultTheme;
  });

  useEffect(() => {
    const themeObj = theme === 'dark' ? darkTheme : lightTheme;
    applyThemeToDOM(themeObj);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ds-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

Components then reference tokens via CSS custom properties, making them automatically theme-aware:

```css
/* components/Button/Button.css */
.ds-button {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  padding: var(--space-inline-sm) var(--space-inline-md);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.ds-button:hover {
  background-color: var(--color-primary-hover);
}

.ds-button:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

> **Common Mistake:** Defining tokens as JavaScript objects and passing them through React context to every component via inline styles. This approach forces every component to re-render when the theme changes, produces inline styles that are harder to debug and override, and loses the cascade behavior that makes CSS custom properties powerful. CSS custom properties applied to the root element are inherited by all descendants without any React re-renders.

### Spacing Scale

A consistent spacing scale prevents arbitrary values from creeping into the codebase. The most common approach is a 4px base unit with multipliers:

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
}
```

### Typography Scale

Typography tokens define a type ramp that components draw from:

```css
:root {
  --font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --font-size-xs: 0.75rem;     /* 12px */
  --font-size-sm: 0.875rem;    /* 14px */
  --font-size-md: 1rem;        /* 16px */
  --font-size-lg: 1.125rem;    /* 18px */
  --font-size-xl: 1.25rem;     /* 20px */
  --font-size-2xl: 1.5rem;     /* 24px */
  --font-size-3xl: 1.875rem;   /* 30px */

  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

> **See Also:** Part 3, Chapter 8, Section 8.4 for the fundamentals of CSS variables and dark mode implementation.

---

## 8.3 Component API Design: Variants, Sizes, Compound Props

### The Props-as-API Principle

A component's props form its public API. Like any API, it should be minimal, consistent, and hard to misuse. The goal is to provide enough flexibility for legitimate use cases while preventing configurations that produce broken or inconsistent UI.

### Variants

Variants represent distinct visual treatments of a component. A `Button` might have `solid`, `outline`, `ghost`, and `link` variants. Each variant is a complete visual style, not a modifier to be combined with other variants:

```javascript
// components/Button/Button.js
import { cva } from 'class-variance-authority';
import './Button.css';

const buttonVariants = cva(
  // Base classes applied to all variants
  [
    'ds-button',
    'inline-flex items-center justify-center',
    'font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2',
    'focus-visible:outline-offset-2 focus-visible:outline-blue-500',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        solid:
          'bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)]',
        outline:
          'border border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-background-muted)]',
        ghost:
          'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-background-muted)]',
        danger:
          'bg-[var(--color-danger)] text-[var(--color-text-inverse)] hover:bg-[var(--color-danger-hover)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded',
        md: 'h-10 px-4 text-sm rounded-md',
        lg: 'h-12 px-6 text-base rounded-md',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
);

export function Button({
  children,
  variant,
  size,
  disabled = false,
  className = '',
  ...rest
}) {
  return (
    <button
      className={`${buttonVariants({ variant, size })} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
```

Usage is clear and self-documenting:

```javascript
<Button variant="solid" size="lg">Save Changes</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="danger">Delete Account</Button>
<Button variant="ghost" size="sm">Skip</Button>
```

### Class Variance Authority (CVA)

CVA is a utility that manages class name composition based on variant props. It has become the standard approach for building variant-driven components in Tailwind-based design systems (used by shadcn/ui, among others). For projects that do not use Tailwind, the same pattern can be implemented with CSS Modules or plain CSS by mapping variant values to class names:

```javascript
// Without CVA: manual variant mapping with CSS Modules
import styles from './Button.module.css';

const variantClassMap = {
  solid: styles.solid,
  outline: styles.outline,
  ghost: styles.ghost,
  danger: styles.danger,
};

const sizeClassMap = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

export function Button({
  children,
  variant = 'solid',
  size = 'md',
  className = '',
  ...rest
}) {
  const classes = [
    styles.base,
    variantClassMap[variant],
    sizeClassMap[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
```

### Compound Variants

Some style combinations require special treatment. A `solid` variant at `sm` size might need different padding than a `ghost` variant at `sm` size. CVA supports compound variants for this:

```javascript
const buttonVariants = cva('ds-button', {
  variants: {
    variant: {
      solid: 'bg-blue-600 text-white',
      outline: 'border border-gray-300 bg-transparent',
    },
    size: {
      sm: 'text-sm h-8',
      lg: 'text-base h-12',
    },
  },
  compoundVariants: [
    {
      // When variant is "outline" AND size is "sm",
      // add extra horizontal padding for visual balance.
      variant: 'outline',
      size: 'sm',
      className: 'px-4',
    },
  ],
  defaultVariants: {
    variant: 'solid',
    size: 'md',
  },
});
```

### Consistent API Conventions

Establish naming conventions that every component in the system follows:

| Prop | Type | Purpose | Example Values |
|------|------|---------|---------------|
| `variant` | string | Visual treatment | `'solid'`, `'outline'`, `'ghost'` |
| `size` | string | Dimensional scale | `'sm'`, `'md'`, `'lg'` |
| `disabled` | boolean | Interactive state | `true`, `false` |
| `className` | string | Escape hatch for custom styles | Any CSS class |
| `children` | node | Content | JSX or text |
| `asChild` | boolean | Composition slot (Radix pattern) | `true`, `false` |

Every component in the system should use the same vocabulary. If `Button` uses `variant="outline"`, then `Badge` and `Alert` should also use `variant="outline"` for their bordered styles, not `bordered={true}` or `type="outlined"`.

> **Common Mistake:** Creating boolean props for every visual variation: `isPrimary`, `isOutline`, `isGhost`, `isDanger`, `isLarge`, `isSmall`. This leads to impossible states (what happens when both `isPrimary` and `isDanger` are true?) and makes the API harder to learn. A single `variant` prop with an enumerated set of values prevents impossible combinations and is self-documenting.

---

## 8.4 Building Accessible Base Components

### The Accessibility Contract

Every component in a design system must fulfill an accessibility contract. This is not optional polish; it is a core requirement. When a team uses a design system component, they trust that keyboard navigation, screen reader announcements, focus management, and ARIA attributes are handled correctly. If the base component is inaccessible, every feature built with it inherits that inaccessibility.

### WAI-ARIA Authoring Practices

The WAI-ARIA Authoring Practices Guide (APG) provides implementation patterns for common UI widgets. Each pattern specifies the required ARIA roles, states, properties, and keyboard interactions. Design system components should follow these patterns precisely.

### Accessible Button

A button is deceptively complex when it supports multiple rendered elements:

```javascript
// components/Button/Button.js
import { forwardRef } from 'react';

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'solid',
    size = 'md',
    disabled = false,
    loading = false,
    className = '',
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ds-button ds-button--${variant} ds-button--${size} ${className}`}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading && (
        <span className="ds-button__spinner" aria-hidden="true">
          {/* SVG spinner icon */}
          <svg
            className="ds-spinner"
            viewBox="0 0 24 24"
            fill="none"
            width="16"
            height="16"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="60"
              strokeDashoffset="20"
            />
          </svg>
        </span>
      )}
      <span className={loading ? 'ds-button__content--loading' : ''}>
        {children}
      </span>
      {loading && <span className="ds-sr-only">Loading</span>}
    </button>
  );
});
```

Key accessibility decisions:

- `type="button"` is the default, not `"submit"`, preventing accidental form submissions when the button is used outside a form.
- `aria-disabled` is set alongside the native `disabled` attribute. Some assistive technologies announce `aria-disabled` differently from native `disabled`.
- `aria-busy={loading}` communicates the loading state to screen readers.
- The spinner icon is marked `aria-hidden="true"` because it is decorative. A visually hidden "Loading" text provides the accessible label.
- `forwardRef` allows parent components to manage focus on the button.

### Accessible Input

```javascript
// components/Input/Input.js
import { forwardRef, useId } from 'react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    required = false,
    disabled = false,
    className = '',
    id: externalId,
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const inputId = externalId || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  // Combine describedby IDs: error takes priority, hint is always present.
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`ds-input-group ${className}`}>
      <label htmlFor={inputId} className="ds-input-label">
        {label}
        {required && (
          <span className="ds-input-required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="ds-input-hint">
          {hint}
        </p>
      )}

      <input
        ref={ref}
        id={inputId}
        className={`ds-input ${error ? 'ds-input--error' : ''}`}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required}
        {...rest}
      />

      {error && (
        <p id={errorId} className="ds-input-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
```

Key accessibility decisions:

- `useId()` generates a stable, unique ID for linking `<label>` to `<input>` via `htmlFor`/`id`.
- `aria-describedby` links the input to both the hint and the error message. Screen readers announce these when the input receives focus.
- `aria-invalid={true}` signals to assistive technologies that the input's value is invalid.
- The error message uses `role="alert"` so that screen readers announce it immediately when it appears (a live region).
- The asterisk for required fields is marked `aria-hidden="true"` because the `aria-required` attribute already communicates the requirement.

### Accessible Modal (Dialog)

The modal pattern is one of the most complex accessibility challenges. The WAI-ARIA Dialog pattern requires:

1. Focus is trapped inside the modal while it is open.
2. The first focusable element receives focus when the modal opens.
3. Pressing Escape closes the modal.
4. When the modal closes, focus returns to the element that triggered it.
5. Content behind the modal is hidden from screen readers via `aria-hidden` on the root.

```javascript
// components/Modal/Modal.js
import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Trap focus within the modal.
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: if focus is on the first element, wrap to last.
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab: if focus is on the last element, wrap to first.
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    // Save the currently focused element to restore later.
    previousFocusRef.current = document.activeElement;

    // Focus the dialog itself (or the first focusable element inside it).
    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialog.focus();
      }
    }

    // Prevent background scrolling.
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      // Restore focus to the triggering element.
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="ds-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-modal-title"
        className="ds-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="ds-modal-header">
          <h2 id="ds-modal-title" className="ds-modal-title">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="ds-modal-close"
            aria-label="Close dialog"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div className="ds-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
```

Key accessibility decisions:

- `role="dialog"` and `aria-modal="true"` inform screen readers that this is a modal dialog.
- `aria-labelledby` links the dialog to its title, which is announced when the dialog opens.
- Focus is trapped using a `Tab`/`Shift+Tab` key handler that wraps between the first and last focusable elements.
- The overlay receives `aria-hidden="true"` because it is a decorative backdrop, not interactive content.
- Focus is restored to the triggering element on close using a ref that captures `document.activeElement` before the modal opens.

> **Common Mistake:** Using the native HTML `<dialog>` element without understanding its focus management behavior across browsers. While `<dialog>` with `showModal()` handles some accessibility automatically (like inert backgrounds), browser implementations still vary in edge cases. Libraries like Radix UI, React Aria, and Ariakit provide battle-tested implementations of the dialog pattern with consistent cross-browser behavior. For a design system, either use one of these libraries as a foundation or test your custom implementation extensively across browsers and screen readers.

> **See Also:** Part 3, Chapter 9, Sections 9.2 through 9.6 for comprehensive ARIA and accessibility patterns in React.

---

## 8.5 Composition Over Configuration

### The Configuration Trap

As a component evolves, teams often add props to handle every new requirement:

```javascript
// The configuration trap: a Button with 15+ props.
<Button
  label="Save"
  icon={SaveIcon}
  iconPosition="left"
  loading={true}
  loadingText="Saving..."
  tooltip="Save your changes"
  tooltipPosition="top"
  badge={3}
  badgeColor="red"
  fullWidth={true}
  uppercase={false}
  animated={true}
  ripple={true}
/>
```

This "configuration" approach has several problems:

1. **Combinatorial explosion.** Every new prop doubles the number of possible states to test.
2. **Impossible states.** What does `loading={true}` with `disabled={true}` mean? What if `icon` is provided but `iconPosition` is not?
3. **Inflexible layout.** The component controls the layout internally. If a consumer needs the icon below the text instead of beside it, they need yet another prop.
4. **Difficult maintenance.** Changing any internal layout requires updating the component and potentially breaking consumers who depend on the existing layout.

### The Composition Approach

Composition gives consumers building blocks that they assemble:

```javascript
// Composition approach: small, focused components composed together.
<Button variant="solid" size="md">
  <Button.Icon>
    <SaveIcon />
  </Button.Icon>
  <Button.Label>Save</Button.Label>
</Button>

// Loading state
<Button variant="solid" size="md" disabled>
  <Button.Spinner />
  <Button.Label>Saving...</Button.Label>
</Button>

// Icon only
<Button variant="ghost" size="sm" aria-label="Save">
  <SaveIcon />
</Button>

// With badge
<Button variant="outline" size="md">
  <Button.Label>Notifications</Button.Label>
  <Badge count={3} />
</Button>
```

### Implementing Composable Components

The key technique is using `children` and small sub-components rather than configuration props:

```javascript
// components/Card/Card.js

function Card({ children, className = '', ...rest }) {
  return (
    <div
      className={`ds-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardHeader({ children, className = '' }) {
  return <div className={`ds-card-header ${className}`}>{children}</div>;
}

function CardTitle({ children, className = '' }) {
  return <h3 className={`ds-card-title ${className}`}>{children}</h3>;
}

function CardDescription({ children, className = '' }) {
  return <p className={`ds-card-description ${className}`}>{children}</p>;
}

function CardBody({ children, className = '' }) {
  return <div className={`ds-card-body ${className}`}>{children}</div>;
}

function CardFooter({ children, className = '' }) {
  return <div className={`ds-card-footer ${className}`}>{children}</div>;
}

// Attach sub-components for dot notation access.
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Body = CardBody;
Card.Footer = CardFooter;

export { Card };
```

Usage is flexible and self-documenting:

```javascript
// Standard card
<Card>
  <Card.Header>
    <Card.Title>Order Summary</Card.Title>
    <Card.Description>Review your items before checkout</Card.Description>
  </Card.Header>
  <Card.Body>
    <OrderItems items={items} />
  </Card.Body>
  <Card.Footer>
    <Button variant="outline">Continue Shopping</Button>
    <Button variant="solid">Checkout</Button>
  </Card.Footer>
</Card>

// Minimal card (no header)
<Card>
  <Card.Body>
    <p>Simple content card without a header.</p>
  </Card.Body>
</Card>

// Card with custom layout in the header
<Card>
  <Card.Header>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Card.Title>Dashboard</Card.Title>
      <Badge variant="success">Live</Badge>
    </div>
  </Card.Header>
  <Card.Body>
    <DashboardContent />
  </Card.Body>
</Card>
```

### When Configuration Is Appropriate

Composition is not always superior. Use configuration props when:

1. **The internal layout is fixed and should not vary.** A `Checkbox` always renders a box and a label in a specific arrangement.
2. **The prop controls behavior, not layout.** `disabled`, `loading`, `required` are behavioral props, not layout props.
3. **The consumer should not need to know the internal structure.** An `Avatar` component that takes `src`, `alt`, and `size` is simpler and safer than requiring the consumer to compose `<Avatar><Avatar.Image src="..." /><Avatar.Fallback>JD</Avatar.Fallback></Avatar>` for every usage.

The decision framework: if a prop controls visual arrangement or content structure, prefer composition. If a prop controls behavior or a single, well-defined value, prefer configuration.

> **See Also:** Part 4, Chapter 3, Sections 3.1 through 3.4 for compound component patterns and headless component architecture.

---

## 8.6 Storybook: Documentation, Visual Testing, Interaction Testing

### Storybook as the Design System Workshop

Storybook serves three roles in a design system: a development environment for building components in isolation, a living documentation site for designers and developers, and a testing platform for visual regression and interaction tests.

### Setting Up Stories

Each component gets a `.stories.js` file that defines its variations:

```javascript
// components/Button/Button.stories.js
import { Button } from './Button';

export default {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost', 'danger'],
      description: 'The visual style of the button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    children: {
      control: 'text',
      description: 'The button content',
    },
  },
};

// The default story. Storybook's autodocs feature
// uses this to generate the component documentation page.
export const Default = {
  args: {
    children: 'Button',
    variant: 'solid',
    size: 'md',
  },
};

// One story per variant, so the docs page shows all options.
export const Solid = {
  args: {
    children: 'Solid Button',
    variant: 'solid',
  },
};

export const Outline = {
  args: {
    children: 'Outline Button',
    variant: 'outline',
  },
};

export const Ghost = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
};

export const Danger = {
  args: {
    children: 'Delete',
    variant: 'danger',
  },
};

// Size variations
export const Small = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

export const Large = {
  args: {
    children: 'Large Button',
    size: 'lg',
  },
};

// State variations
export const Disabled = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};
```

### Interaction Testing with Play Functions

Storybook's play functions allow writing component interaction tests directly within stories. These tests use Testing Library to simulate user behavior and make assertions:

```javascript
// components/Input/Input.stories.js
import { Input } from './Input';
import { within, userEvent, expect } from '@storybook/test';

export default {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    label: 'Email Address',
    placeholder: 'you@example.com',
    hint: 'We will never share your email.',
  },
};

export const WithError = {
  args: {
    label: 'Email Address',
    value: 'not-an-email',
    error: 'Please enter a valid email address.',
  },
};

export const Required = {
  args: {
    label: 'Full Name',
    required: true,
    placeholder: 'Jane Smith',
  },
};

// Interaction test: verify that typing updates the input value,
// and that the input is properly associated with its label.
export const TypingInteraction = {
  args: {
    label: 'Username',
    placeholder: 'Enter your username',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the input by its accessible label.
    const input = canvas.getByLabelText('Username');

    // Verify initial state.
    await expect(input).toHaveValue('');

    // Simulate typing.
    await userEvent.type(input, 'jane_doe');

    // Verify the value was entered.
    await expect(input).toHaveValue('jane_doe');

    // Verify the input is focused after typing.
    await expect(input).toHaveFocus();
  },
};

// Interaction test: verify that clearing the input works.
export const ClearInteraction = {
  args: {
    label: 'Search',
    placeholder: 'Search...',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Search');

    await userEvent.type(input, 'react hooks');
    await expect(input).toHaveValue('react hooks');

    await userEvent.clear(input);
    await expect(input).toHaveValue('');
  },
};
```

### Testing Modal Interactions

Complex components benefit from play function tests that verify keyboard navigation and focus management:

```javascript
// components/Modal/Modal.stories.js
import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from '../Button/Button';
import { within, userEvent, expect } from '@storybook/test';

export default {
  title: 'Components/Modal',
  component: Modal,
};

// Wrapper component that manages open/close state for the story.
function ModalDemo({ title, children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        {children}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="solid" onClick={() => setIsOpen(false)}>
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}

export const Default = {
  render: () => (
    <ModalDemo title="Confirm Action">
      <p>Are you sure you want to proceed with this action?</p>
    </ModalDemo>
  ),
};

export const KeyboardNavigation = {
  render: () => (
    <ModalDemo title="Keyboard Test">
      <p>Try pressing Tab to cycle focus and Escape to close.</p>
    </ModalDemo>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Click the trigger button to open the modal.
    const openButton = canvas.getByText('Open Modal');
    await userEvent.click(openButton);

    // The modal should now be visible in the document body.
    // Use screen-level queries since the modal is portaled.
    const dialog = document.querySelector('[role="dialog"]');
    await expect(dialog).not.toBeNull();

    // Verify the dialog has a title.
    const title = within(dialog).getByText('Keyboard Test');
    await expect(title).toBeVisible();

    // Press Escape to close the modal.
    await userEvent.keyboard('{Escape}');

    // The dialog should be removed from the DOM.
    const closedDialog = document.querySelector('[role="dialog"]');
    await expect(closedDialog).toBeNull();

    // Focus should return to the trigger button.
    await expect(openButton).toHaveFocus();
  },
};
```

### Visual Regression Testing

Visual regression tests capture screenshots of stories and compare them across commits. Two primary approaches:

**Chromatic** (hosted, by the Storybook team) integrates directly with Storybook. It captures screenshots of every story on every push and surfaces visual differences in a review UI:

```javascript
// package.json
{
  "scripts": {
    "chromatic": "npx chromatic --project-token=YOUR_TOKEN"
  }
}
```

**Playwright-based local testing** uses `@storybook/test-runner` to capture and compare screenshots locally:

```javascript
// .storybook/test-runner.js
module.exports = {
  async postVisit(page, context) {
    // Capture a screenshot of each story after it renders.
    const image = await page.screenshot();
    expect(image).toMatchSnapshot(context.id + '.png');
  },
};
```

### Storybook as Documentation

The `tags: ['autodocs']` annotation generates a documentation page from the component's stories, argTypes, and JSDoc comments. For richer documentation, add MDX pages:

```markdown
{/* components/Button/Button.mdx */}
import { Meta, Story, Canvas, Controls } from '@storybook/blocks';
import * as ButtonStories from './Button.stories';

<Meta of={ButtonStories} />

# Button

Buttons trigger actions. Use the `variant` prop to select a visual style
and the `size` prop to control dimensions.

## Usage Guidelines

- Use `solid` for primary actions (one per section).
- Use `outline` for secondary actions.
- Use `ghost` for tertiary or less prominent actions.
- Use `danger` only for destructive actions (delete, remove).

<Canvas of={ButtonStories.Default} />
<Controls of={ButtonStories.Default} />

## All Variants

<Canvas>
  <Story of={ButtonStories.Solid} />
  <Story of={ButtonStories.Outline} />
  <Story of={ButtonStories.Ghost} />
  <Story of={ButtonStories.Danger} />
</Canvas>
```

> **Common Mistake:** Writing stories that only demonstrate the "happy path" (the default configuration). A design system's Storybook should include stories for every variant, every size, disabled states, loading states, error states, long text content (to test overflow), right-to-left text, and edge cases. These stories serve double duty: they document the component's capabilities and they serve as visual regression test cases.

---

## 8.7 Versioning and Publishing Components

### Semantic Versioning

A design system component library follows semantic versioning (SemVer): `MAJOR.MINOR.PATCH`.

- **PATCH** (1.0.0 to 1.0.1): Bug fixes, style corrections, and internal refactors that do not change the component's API or visual appearance.
- **MINOR** (1.0.0 to 1.1.0): New components, new variants, new props with default values (backward-compatible additions).
- **MAJOR** (1.0.0 to 2.0.0): Removed components, renamed props, changed default behavior, visual redesigns that require consumer updates.

### Changesets for Version Management

Changesets is the standard tool for managing versions in monorepos. It works by collecting "changeset" files during development, then consuming them to bump versions and generate changelogs at release time.

**Workflow:**

1. A developer makes a change to the Button component. Before (or alongside) the pull request, they run `npx changeset`:

```
$ npx changeset

What packages would you like to include?
> @myapp/ui

What type of change is this for @myapp/ui?
> patch

Please enter a summary for this change:
> Fix Button focus ring not appearing in Safari
```

This creates a markdown file in the `.changeset/` directory:

```markdown
---
"@myapp/ui": patch
---

Fix Button focus ring not appearing in Safari
```

2. When the team is ready to release, they run `npx changeset version`. This command reads all pending changeset files, determines the appropriate version bump (the highest severity wins), updates `package.json` versions, and writes the `CHANGELOG.md`:

```markdown
# @myapp/ui

## 1.2.3

### Patch Changes

- Fix Button focus ring not appearing in Safari
- Correct Modal z-index stacking in nested contexts
```

3. Finally, `npx changeset publish` publishes the package to the npm registry.

### Publishing Configuration

```javascript
// packages/ui/package.json
{
  "name": "@myapp/ui",
  "version": "1.2.3",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./Button": {
      "import": "./dist/Button.mjs",
      "require": "./dist/Button.js"
    },
    "./Input": {
      "import": "./dist/Input.mjs",
      "require": "./dist/Input.js"
    },
    "./Modal": {
      "import": "./dist/Modal.mjs",
      "require": "./dist/Modal.js"
    },
    "./styles.css": "./dist/styles.css"
  },
  "files": ["dist"],
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "scripts": {
    "build": "vite build",
    "prepublishOnly": "npm run build"
  }
}
```

Key decisions:

- **`peerDependencies` for React.** The component library does not bundle React; consumers provide it. This prevents duplicate React instances.
- **`exports` field for tree-shaking.** Consumers who import `@myapp/ui/Button` get only the Button code, not the entire library. This avoids the barrel file performance problem discussed in the previous chapter.
- **`files` array.** Only the `dist/` directory is published to npm, keeping the package size small.

### CI/CD Integration

A typical CI pipeline for a design system:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - run: npm run lint
      - run: npm run test
      - run: npm run build

      # Chromatic visual regression test
      - run: npx chromatic --project-token=${{ secrets.CHROMATIC_TOKEN }}

      # Create release PR or publish
      - uses: changesets/action@v1
        with:
          publish: npx changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Deprecation Strategy

When a component or prop needs to be removed, follow a deprecation path rather than removing it immediately:

```javascript
// components/OldButton/OldButton.js
import { useEffect } from 'react';
import { Button } from '../Button/Button';

/**
 * @deprecated Use `Button` from `@myapp/ui/Button` instead.
 * This component will be removed in v3.0.0.
 */
export function OldButton(props) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[@myapp/ui] OldButton is deprecated. ' +
        'Use Button from @myapp/ui/Button instead. ' +
        'OldButton will be removed in v3.0.0.'
      );
    }
  }, []);

  return <Button {...props} />;
}
```

1. **v2.3.0** (minor): Add the new component. Mark the old one as deprecated with a console warning in development.
2. **v2.x.x** (subsequent minors): Keep the deprecated component working. Update documentation to recommend the new component.
3. **v3.0.0** (major): Remove the deprecated component. The changelog entry clearly states the removal and the migration path.

> **See Also:** Part 4, Chapter 7, Section 7.6 for shared package architecture and monorepo publishing workflows.

---

## 8.8 Exercise: Build 5 Design System Components (Button, Input, Modal, Toast, Card)

### Problem Statement

Build a small design system with five core components: `Button`, `Input`, `Modal`, `Toast`, and `Card`. Each component must:

- Consume design tokens via CSS custom properties
- Support at least two variants or meaningful prop variations
- Be accessible (keyboard navigable, screen reader friendly, ARIA compliant)
- Follow the composition-over-configuration principle where appropriate
- Include at least one Storybook story with a play function interaction test

### Setup

Create the following structure:

```
design-system/
  tokens/
    global.css
  components/
    Button/
      Button.js
      Button.css
      Button.stories.js
    Input/
      Input.js
      Input.css
      Input.stories.js
    Modal/
      Modal.js
      Modal.css
      Modal.stories.js
    Toast/
      Toast.js
      Toast.css
      Toast.stories.js
    Card/
      Card.js
      Card.css
      Card.stories.js
```

### Solution

**Step 1: Design Tokens**

```css
/* tokens/global.css */
:root {
  /* Primitive Colors */
  --blue-50: #eff6ff;
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --blue-700: #1d4ed8;
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-500: #6b7280;
  --gray-700: #374151;
  --gray-900: #111827;
  --white: #ffffff;
  --red-50: #fef2f2;
  --red-500: #ef4444;
  --red-600: #dc2626;
  --green-50: #f0fdf4;
  --green-500: #22c55e;
  --green-700: #15803d;
  --amber-50: #fffbeb;
  --amber-500: #f59e0b;
  --amber-700: #b45309;

  /* Semantic Tokens */
  --color-bg: var(--white);
  --color-bg-subtle: var(--gray-50);
  --color-bg-muted: var(--gray-100);
  --color-text: var(--gray-900);
  --color-text-secondary: var(--gray-500);
  --color-text-inverse: var(--white);
  --color-primary: var(--blue-600);
  --color-primary-hover: var(--blue-700);
  --color-danger: var(--red-500);
  --color-danger-hover: var(--red-600);
  --color-success: var(--green-500);
  --color-border: var(--gray-200);
  --color-border-focus: var(--blue-500);

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --font-medium: 500;
  --font-semibold: 600;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
}

/* Dark theme override */
[data-theme='dark'] {
  --color-bg: var(--gray-900);
  --color-bg-subtle: var(--gray-700);
  --color-bg-muted: var(--gray-700);
  --color-text: var(--gray-50);
  --color-text-secondary: var(--gray-300);
  --color-text-inverse: var(--gray-900);
  --color-border: var(--gray-500);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
}
```

**Step 2: Button Component**

```css
/* components/Button/Button.css */
.ds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-sans);
  font-weight: var(--font-medium);
  border: none;
  cursor: pointer;
  transition: background-color var(--transition-fast),
              border-color var(--transition-fast);
  line-height: 1;
}

.ds-btn:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}

.ds-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Variants */
.ds-btn--solid {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}
.ds-btn--solid:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.ds-btn--outline {
  background-color: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.ds-btn--outline:hover:not(:disabled) {
  background-color: var(--color-bg-muted);
}

.ds-btn--ghost {
  background-color: transparent;
  color: var(--color-text);
  border: 1px solid transparent;
}
.ds-btn--ghost:hover:not(:disabled) {
  background-color: var(--color-bg-muted);
}

.ds-btn--danger {
  background-color: var(--color-danger);
  color: var(--color-text-inverse);
}
.ds-btn--danger:hover:not(:disabled) {
  background-color: var(--color-danger-hover);
}

/* Sizes */
.ds-btn--sm {
  height: 2rem;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
}

.ds-btn--md {
  height: 2.5rem;
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
  border-radius: var(--radius-md);
}

.ds-btn--lg {
  height: 3rem;
  padding: 0 var(--space-6);
  font-size: var(--text-md);
  border-radius: var(--radius-md);
}
```

```javascript
// components/Button/Button.js
import { forwardRef } from 'react';
import './Button.css';

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'solid',
    size = 'md',
    type = 'button',
    disabled = false,
    className = '',
    ...rest
  },
  ref
) {
  const classes = [
    'ds-btn',
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
});
```

```javascript
// components/Button/Button.stories.js
import { Button } from './Button';
import { within, userEvent, expect } from '@storybook/test';

export default {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost', 'danger'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export const Solid = { args: { children: 'Save Changes', variant: 'solid' } };
export const Outline = { args: { children: 'Cancel', variant: 'outline' } };
export const Ghost = { args: { children: 'Skip', variant: 'ghost' } };
export const Danger = { args: { children: 'Delete', variant: 'danger' } };
export const Small = { args: { children: 'Small', size: 'sm' } };
export const Large = { args: { children: 'Large Button', size: 'lg' } };

export const ClickInteraction = {
  args: { children: 'Click Me' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Click Me' });

    // Verify the button is focusable.
    await userEvent.tab();
    await expect(button).toHaveFocus();

    // Verify click works.
    await userEvent.click(button);
  },
};

export const DisabledInteraction = {
  args: { children: 'Disabled', disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Disabled' });
    await expect(button).toBeDisabled();
  },
};
```

**Step 3: Input Component**

```css
/* components/Input/Input.css */
.ds-input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ds-input-label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text);
}

.ds-input-required {
  color: var(--color-danger);
  margin-left: var(--space-1);
}

.ds-input-hint {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin: 0;
}

.ds-input {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  height: 2.5rem;
  transition: border-color var(--transition-fast);
}

.ds-input:focus {
  outline: none;
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.ds-input--error {
  border-color: var(--color-danger);
}

.ds-input--error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.ds-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ds-input-error {
  font-size: var(--text-xs);
  color: var(--color-danger);
  margin: 0;
}

.ds-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

```javascript
// components/Input/Input.js
import { forwardRef, useId } from 'react';
import './Input.css';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    required = false,
    disabled = false,
    className = '',
    id: externalId,
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const inputId = externalId || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`ds-input-group ${className}`}>
      <label htmlFor={inputId} className="ds-input-label">
        {label}
        {required && (
          <span className="ds-input-required" aria-hidden="true">*</span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="ds-input-hint">{hint}</p>
      )}

      <input
        ref={ref}
        id={inputId}
        className={`ds-input ${error ? 'ds-input--error' : ''}`}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required}
        {...rest}
      />

      {error && (
        <p id={errorId} className="ds-input-error" role="alert">{error}</p>
      )}
    </div>
  );
});
```

```javascript
// components/Input/Input.stories.js
import { Input } from './Input';
import { within, userEvent, expect } from '@storybook/test';

export default {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
};

export const Default = {
  args: { label: 'Email', placeholder: 'you@example.com' },
};

export const WithHint = {
  args: {
    label: 'Password',
    type: 'password',
    hint: 'Must be at least 8 characters.',
  },
};

export const WithError = {
  args: {
    label: 'Email',
    error: 'Please enter a valid email address.',
    value: 'invalid',
  },
};

export const Required = {
  args: { label: 'Full Name', required: true },
};

export const TypingTest = {
  args: { label: 'Username', placeholder: 'Enter username' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Username');

    await userEvent.type(input, 'janedoe');
    await expect(input).toHaveValue('janedoe');
  },
};
```

**Step 4: Modal Component**

```css
/* components/Modal/Modal.css */
.ds-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: ds-fade-in 150ms ease;
}

.ds-modal {
  background-color: var(--color-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 90%;
  max-width: 32rem;
  max-height: 85vh;
  overflow-y: auto;
  animation: ds-scale-in 150ms ease;
}

.ds-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.ds-modal-title {
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text);
  margin: 0;
}

.ds-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  line-height: 1;
}

.ds-modal-close:hover {
  background-color: var(--color-bg-muted);
}

.ds-modal-close:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}

.ds-modal-body {
  padding: var(--space-6);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
}

@keyframes ds-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ds-scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
```

```javascript
// components/Modal/Modal.js
// See the full implementation in Section 8.4 above.
// The implementation there includes focus trapping, Escape handling,
// focus restoration, scroll locking, and proper ARIA attributes.
import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement;

    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialog.focus();
      }
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="ds-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-modal-title"
        className="ds-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="ds-modal-header">
          <h2 id="ds-modal-title" className="ds-modal-title">{title}</h2>
          <button
            onClick={onClose}
            className="ds-modal-close"
            aria-label="Close dialog"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div className="ds-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
```

**Step 5: Toast Component**

The Toast component uses a notification pattern: messages appear temporarily, can be dismissed, and have severity levels.

```css
/* components/Toast/Toast.css */
.ds-toast-container {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 60;
}

.ds-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  min-width: 20rem;
  max-width: 28rem;
  animation: ds-slide-in 200ms ease;
}

.ds-toast--info {
  background-color: var(--blue-50);
  border-left: 4px solid var(--blue-500);
  color: var(--gray-900);
}

.ds-toast--success {
  background-color: var(--green-50);
  border-left: 4px solid var(--green-500);
  color: var(--gray-900);
}

.ds-toast--error {
  background-color: var(--red-50);
  border-left: 4px solid var(--red-500);
  color: var(--gray-900);
}

.ds-toast--warning {
  background-color: var(--amber-50);
  border-left: 4px solid var(--amber-500);
  color: var(--gray-900);
}

.ds-toast__message {
  flex: 1;
}

.ds-toast__dismiss {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
}

.ds-toast__dismiss:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

@keyframes ds-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

```javascript
// components/Toast/Toast.js
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import './Toast.css';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ message, variant = 'info', duration = 5000 }) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        className="ds-toast-container"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(onDismiss, toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.duration, onDismiss]);

  return (
    <div
      className={`ds-toast ds-toast--${toast.variant}`}
      role="status"
      aria-atomic="true"
    >
      <span className="ds-toast__message">{toast.message}</span>
      <button
        className="ds-toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
```

```javascript
// components/Toast/Toast.stories.js
import { ToastProvider, useToast } from './Toast';
import { Button } from '../Button/Button';
import { within, userEvent, expect } from '@storybook/test';

export default {
  title: 'Components/Toast',
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

function ToastDemo({ variant = 'info', message = 'This is a notification.' }) {
  const { addToast } = useToast();
  return (
    <Button onClick={() => addToast({ message, variant, duration: 0 })}>
      Show {variant} toast
    </Button>
  );
}

export const Info = {
  render: () => <ToastDemo variant="info" message="Your changes have been saved." />,
};

export const Success = {
  render: () => <ToastDemo variant="success" message="File uploaded successfully." />,
};

export const Error = {
  render: () => <ToastDemo variant="error" message="Failed to save changes." />,
};

export const Warning = {
  render: () => <ToastDemo variant="warning" message="Your session will expire soon." />,
};

export const DismissInteraction = {
  render: () => <ToastDemo variant="info" message="Dismiss me!" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Trigger a toast.
    const triggerButton = canvas.getByRole('button');
    await userEvent.click(triggerButton);

    // Find and dismiss the toast.
    const dismissButton = await within(document.body).findByLabelText(
      'Dismiss notification'
    );
    await expect(dismissButton).toBeVisible();
    await userEvent.click(dismissButton);
  },
};
```

**Step 6: Card Component**

```css
/* components/Card/Card.css */
.ds-card {
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.ds-card-header {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.ds-card-title {
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text);
  margin: 0;
}

.ds-card-description {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: var(--space-1) 0 0 0;
}

.ds-card-body {
  padding: var(--space-6);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
}

.ds-card-footer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border);
}
```

```javascript
// components/Card/Card.js
import './Card.css';

function Card({ children, className = '', ...rest }) {
  return (
    <div className={`ds-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardHeader({ children, className = '' }) {
  return <div className={`ds-card-header ${className}`}>{children}</div>;
}

function CardTitle({ children, className = '', as: Tag = 'h3' }) {
  return <Tag className={`ds-card-title ${className}`}>{children}</Tag>;
}

function CardDescription({ children, className = '' }) {
  return <p className={`ds-card-description ${className}`}>{children}</p>;
}

function CardBody({ children, className = '' }) {
  return <div className={`ds-card-body ${className}`}>{children}</div>;
}

function CardFooter({ children, className = '' }) {
  return <div className={`ds-card-footer ${className}`}>{children}</div>;
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Body = CardBody;
Card.Footer = CardFooter;

export { Card };
```

```javascript
// components/Card/Card.stories.js
import { Card } from './Card';
import { Button } from '../Button/Button';
import { within, expect } from '@storybook/test';

export default {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
};

export const WithHeaderAndFooter = {
  render: () => (
    <Card style={{ maxWidth: '24rem' }}>
      <Card.Header>
        <Card.Title>Order Summary</Card.Title>
        <Card.Description>Review your items before checkout</Card.Description>
      </Card.Header>
      <Card.Body>
        <p>3 items in your cart. Subtotal: $89.97</p>
      </Card.Body>
      <Card.Footer>
        <Button variant="outline" size="sm">Continue Shopping</Button>
        <Button variant="solid" size="sm">Checkout</Button>
      </Card.Footer>
    </Card>
  ),
};

export const Minimal = {
  render: () => (
    <Card style={{ maxWidth: '24rem' }}>
      <Card.Body>
        <p>A simple card with only body content.</p>
      </Card.Body>
    </Card>
  ),
};

export const StructureTest = {
  render: () => (
    <Card style={{ maxWidth: '24rem' }}>
      <Card.Header>
        <Card.Title>Test Card</Card.Title>
      </Card.Header>
      <Card.Body>
        <p>Body content here.</p>
      </Card.Body>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify the card title renders.
    const title = canvas.getByText('Test Card');
    await expect(title).toBeVisible();
    await expect(title.tagName).toBe('H3');

    // Verify body content renders.
    const body = canvas.getByText('Body content here.');
    await expect(body).toBeVisible();
  },
};
```

### Key Takeaway

Building a design system is an exercise in constraint and consistency. Every component draws from the same token pool, follows the same API conventions (variant, size, className), and meets the same accessibility bar. The five components in this exercise demonstrate the core patterns that scale to a full system: tokens as CSS custom properties for zero-runtime theming, composable sub-components for flexible layout, WAI-ARIA compliance for accessibility, and Storybook stories with play functions for living documentation and automated testing. The discipline of building small, well-tested components with clear boundaries is what separates a design system from a disorganized collection of React files.

---

## Chapter Summary

A design system is a layered artifact comprising tokens, components, patterns, and guidelines, not merely a component library. Design tokens implemented as CSS custom properties enable runtime theme switching without React re-renders and establish a consistent visual language. Component APIs should favor a small set of enumerated variants over boolean props, using tools like Class Variance Authority for class management. Every component must meet a baseline accessibility contract following WAI-ARIA Authoring Practices, covering keyboard navigation, focus management, and screen reader semantics. The composition-over-configuration principle keeps components flexible by offering building blocks rather than exhaustive configuration props. Storybook provides three essential services: isolated development, living documentation (with autodocs and MDX), and automated testing (with play functions for interaction tests and Chromatic for visual regression). Versioning through Changesets and semantic versioning ensures that consumers can adopt updates confidently, with clear changelogs and a predictable deprecation path.

## Further Reading

- [W3C WAI-ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/)
- [Storybook Documentation: Interaction Testing](https://storybook.js.org/docs/writing-tests/interaction-testing)
- [Chromatic: Visual Testing for Storybook](https://www.chromatic.com/storybook)
- [Class Variance Authority (CVA) Documentation](https://cva.style/docs)
- [Changesets: A Way to Manage Your Versioning and Changelogs](https://github.com/changesets/changesets)
- [shadcn/ui: The Foundation for Your Design System](https://ui.shadcn.com/)
- [React Aria: Build Accessible Components](https://react-spectrum.adobe.com/react-aria/)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Vercel: How We Optimized Package Imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
