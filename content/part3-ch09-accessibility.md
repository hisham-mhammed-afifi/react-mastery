# Part 3, Chapter 9: Accessibility (a11y) in React

## What You Will Learn

- Apply semantic HTML elements in JSX to provide built-in keyboard support, implicit ARIA roles, and screen reader compatibility without additional attributes
- Distinguish when ARIA attributes are necessary from when they introduce more harm than benefit (the "no ARIA is better than bad ARIA" principle)
- Implement keyboard navigation patterns for interactive widgets including roving tabindex, arrow key navigation, and type-ahead
- Manage focus in single-page applications: route change announcements, focus trapping in modals, and the `inert` attribute
- Configure automated accessibility testing with `eslint-plugin-jsx-a11y`, `axe-core`, and Testing Library's role-based queries
- Build accessible forms, modal dialogs, and dropdown menus following WAI-ARIA Authoring Practices
- Audit and fix accessibility issues in an existing React application

---

## 9.1 Semantic HTML in JSX

The most impactful accessibility improvement in any React application is using the correct HTML elements. Native HTML elements carry implicit roles, keyboard behaviors, and screen reader announcements that no amount of ARIA can replicate as reliably.

### Native Elements vs ARIA-Enhanced Divs

```javascript
// Inaccessible: a div pretending to be a button
function BadButton({ onClick, children }) {
  return (
    <div
      className="button"
      onClick={onClick}
      // Missing: keyboard support, focus management, role announcement
    >
      {children}
    </div>
  );
}

// Attempting to fix with ARIA (fragile, incomplete)
function BetterButFragileButton({ onClick, children }) {
  return (
    <div
      className="button"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

// Correct: use the native element
function Button({ onClick, children, ...props }) {
  return (
    <button className="button" onClick={onClick} {...props}>
      {children}
    </button>
  );
}
```

The native `<button>` provides: keyboard activation via Enter and Space, automatic focus ring, implicit `role="button"` announcement, disabled state handling via the `disabled` attribute, and form submission behavior. The ARIA-enhanced div requires manual implementation of each of these behaviors.

### Semantic Landmark Elements

```javascript
function AppLayout({ children }) {
  return (
    <div className="app">
      {/* <header> implicitly has role="banner" */}
      <header className="app-header">
        {/* <nav> implicitly has role="navigation" */}
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/products">Products</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </nav>
      </header>

      {/* <main> implicitly has role="main" */}
      <main id="main-content" className="app-content">
        {children}
      </main>

      {/* <aside> implicitly has role="complementary" */}
      <aside aria-label="Related links">
        <h2>Related</h2>
        {/* sidebar content */}
      </aside>

      {/* <footer> implicitly has role="contentinfo" */}
      <footer className="app-footer">
        <p>Copyright 2025</p>
      </footer>
    </div>
  );
}
```

Screen reader users navigate between landmarks using shortcut keys (e.g., the `d` key in NVDA moves to the next landmark). Proper landmark structure allows them to skip directly to the main content, navigation, or footer.

### The Skip Link Pattern

```javascript
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-link"
      // CSS: position absolute, moved off-screen by default,
      // visible on focus (position: static or similar)
    >
      Skip to main content
    </a>
  );
}

// Place as the first focusable element in the app
function App() {
  return (
    <>
      <SkipLink />
      <AppLayout>
        <Routes>{/* ... */}</Routes>
      </AppLayout>
    </>
  );
}
```

> **Common Mistake:** Using `<div>` with `onClick` instead of `<button>` for clickable elements. This is the single most common accessibility violation in React applications. The `<div>` has no implicit role, no keyboard support, no focus ring, and no screen reader announcement. Even adding `role="button"` and `tabIndex={0}` is insufficient without also implementing `onKeyDown` for Enter and Space. Always use `<button>` for actions, `<a>` for navigation, and `<input>` / `<select>` for form controls.

---

## 9.2 ARIA Attributes and When to Use Them

ARIA (Accessible Rich Internet Applications) attributes communicate widget semantics to assistive technologies. They do not change visual appearance or behavior; they only modify the accessibility tree.

### The First Rule of ARIA

The W3C's first rule of ARIA states: "If you can use a native HTML element or attribute with the semantics and behavior you require already built in, instead of re-purposing an element and adding an ARIA role, state or property to make it accessible, then do so."

A WebAIM study of over one million home pages found that pages with ARIA present averaged 41% more detected accessibility errors than those without ARIA. Improperly applied ARIA is worse than no ARIA at all.

### When ARIA Is Necessary

ARIA is appropriate when building widgets that have no native HTML equivalent:

```javascript
// Tab panel: no native HTML element for tabs
function TabPanel({ tabs }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div role="tablist" aria-label="Product details">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={index === activeIndex}
            aria-controls={`panel-${tab.id}`}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                setActiveIndex((prev) => (prev + 1) % tabs.length);
              } else if (e.key === "ArrowLeft") {
                setActiveIndex((prev) => (prev - 1 + tabs.length) % tabs.length);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={index !== activeIndex}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

### Common ARIA Attributes in React

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `aria-label` | Provides an accessible name when no visible text exists | `<button aria-label="Close dialog">X</button>` |
| `aria-labelledby` | Points to another element's ID as the accessible name | `<div role="dialog" aria-labelledby="title-id">` |
| `aria-describedby` | Points to an element providing additional description | `<input aria-describedby="help-text-id" />` |
| `aria-expanded` | Indicates whether a collapsible section is open | `<button aria-expanded={isOpen}>Menu</button>` |
| `aria-hidden` | Removes an element from the accessibility tree | `<span aria-hidden="true">decorative icon</span>` |
| `aria-live` | Announces dynamic content changes to screen readers | `<div aria-live="polite">{statusMessage}</div>` |
| `aria-invalid` | Indicates a form field has a validation error | `<input aria-invalid={!!error} />` |
| `aria-current` | Identifies the current item in a set | `<a aria-current="page">Home</a>` |

### `aria-live` Regions for Dynamic Content

```javascript
function StatusAnnouncer() {
  const [message, setMessage] = useState("");

  // The container must exist in the DOM before the content changes.
  // If React renders the container and content simultaneously,
  // screen readers may miss the announcement.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only" // Visually hidden but accessible
    >
      {message}
    </div>
  );
}

// Usage: update the message to announce changes
function SaveButton({ onSave }) {
  const [status, setStatus] = useState("");

  async function handleSave() {
    setStatus(""); // Clear first to ensure re-announcement
    try {
      await onSave();
      setStatus("Changes saved successfully");
    } catch {
      setStatus("Failed to save changes");
    }
  }

  return (
    <>
      <button onClick={handleSave}>Save</button>
      <div aria-live="polite" className="sr-only">{status}</div>
    </>
  );
}
```

---

## 9.3 Keyboard Navigation Patterns

All interactive elements must be operable via keyboard. The standard keyboard interactions for web applications are:

| Key | Action |
|-----|--------|
| Tab | Move focus to the next focusable element |
| Shift + Tab | Move focus to the previous focusable element |
| Enter | Activate the focused element (links, buttons) |
| Space | Activate buttons, toggle checkboxes |
| Escape | Close dialogs, menus, popovers |
| Arrow keys | Navigate within composite widgets (tabs, menus, lists) |

### Roving Tabindex

In composite widgets (tab lists, toolbars, menu bars), only one item should be in the tab order at a time. Arrow keys move focus between items within the widget. This is the "roving tabindex" pattern:

```javascript
function Toolbar({ items }) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef([]);

  useEffect(() => {
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  function handleKeyDown(e) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
        break;
      case "ArrowLeft":
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  }

  return (
    <div role="toolbar" aria-label="Formatting options" onKeyDown={handleKeyDown}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => (itemRefs.current[index] = el)}
          tabIndex={index === focusedIndex ? 0 : -1}
          aria-pressed={item.active}
          onClick={() => item.onToggle()}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

The user presses Tab to enter the toolbar, uses arrow keys to navigate between buttons, and presses Tab again to leave. This reduces the number of Tab stops, making navigation faster.

### Visible Focus Indicators

```css
/* Never remove focus outlines without a replacement */
/* Bad: */
*:focus { outline: none; }

/* Good: custom focus style that is clearly visible */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 4px;
}

/* :focus-visible applies only for keyboard navigation,
   not for mouse clicks, providing the best of both worlds */
```

---

## 9.4 Focus Management in SPAs

### Route Change Announcements

When the user navigates to a new page in a SPA, screen readers receive no automatic notification. The page content changes, but the browser does not announce the new page title.

```javascript
function RouteAnnouncer() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Announce the new page title after navigation
    const pageTitle = document.title;
    setAnnouncement(`Navigated to ${pageTitle}`);
  }, [location.pathname]);

  return (
    <div
      aria-live="assertive"
      aria-atomic="true"
      role="status"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}

// Place at the root of the application
function App() {
  return (
    <BrowserRouter>
      <RouteAnnouncer />
      <Routes>{/* ... */}</Routes>
    </BrowserRouter>
  );
}
```

### Focus Reset on Navigation

After announcing the route change, move focus to the new page's heading or main content:

```javascript
function PageContainer({ title, children }) {
  const headingRef = useRef(null);

  useEffect(() => {
    // Move focus to the heading when the page mounts
    headingRef.current?.focus();
  }, []);

  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="page-heading">
        {title}
      </h1>
      {children}
    </div>
  );
}
```

Setting `tabIndex={-1}` on the heading makes it programmatically focusable without adding it to the natural tab order.

### Focus Trapping in Modals

```javascript
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Store the element that had focus before the modal opened
      previousFocus.current = document.activeElement;
      // Move focus into the modal
      modalRef.current?.focus();

      // Make the rest of the page inert
      document.getElementById("root").setAttribute("inert", "");
    }

    return () => {
      // Remove inert when modal closes
      document.getElementById("root").removeAttribute("inert");
      // Return focus to the element that triggered the modal
      previousFocus.current?.focus();
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title">{title}</h2>
        {children}
        <button onClick={onClose} aria-label="Close dialog">
          Close
        </button>
      </div>
    </div>
  );
}
```

### The `inert` Attribute

The `inert` attribute removes an element and all its descendants from the tab order, the accessibility tree, and pointer events. It is the modern replacement for manually applying `aria-hidden="true"` to every sibling of a modal:

```javascript
// When modal opens, make the app content inert
document.getElementById("root").setAttribute("inert", "");

// When modal closes, restore interactivity
document.getElementById("root").removeAttribute("inert");
```

The native `<dialog>` element's `showModal()` method applies `inert` to sibling content automatically. All modern browsers support `inert` as of 2024.

---

## 9.5 Screen Reader Testing

Automated tools detect approximately 30-50% of accessibility issues. The remaining barriers require manual testing with assistive technology.

### Automated Testing: eslint-plugin-jsx-a11y

```javascript
// .eslintrc.js
module.exports = {
  plugins: ["jsx-a11y"],
  extends: ["plugin:jsx-a11y/recommended"],
  rules: {
    "jsx-a11y/no-autofocus": "warn",
    "jsx-a11y/anchor-is-valid": "error",
  },
};

// Catches issues like:
// <img src="photo.jpg" />            → Error: img elements must have an alt prop
// <div onClick={handleClick}>        → Error: non-interactive element has click handler
// <input />                          → Error: input element must have accessible label
```

### Runtime Testing: axe-core with Testing Library

```javascript
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

test("ProductCard has no accessibility violations", async () => {
  const { container } = render(
    <ProductCard product={{ name: "Keyboard", price: 79.99, imageUrl: "/kb.jpg" }} />
  );

  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test("LoginForm has no accessibility violations", async () => {
  const { container } = render(<LoginForm onSubmit={() => {}} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Testing Library Query Priority

Testing Library's query functions are ranked by how closely they mirror assistive technology access:

```javascript
import { render, screen } from "@testing-library/react";

// Preferred: queries that reflect accessibility
screen.getByRole("button", { name: /submit/i });    // Queries the accessibility tree
screen.getByLabelText(/email address/i);              // How users find form fields
screen.getByText(/welcome back/i);                    // Visible text content

// Acceptable: when semantic queries are not possible
screen.getByPlaceholderText(/search/i);
screen.getByAltText(/product photo/i);

// Last resort: no accessibility benefit
screen.getByTestId("custom-dropdown");
```

If `getByRole` cannot find an element, the component may have an accessibility issue. A button that cannot be found by `getByRole("button")` is likely a styled `<div>` without proper semantics.

### Manual Screen Reader Testing

| Screen Reader | Platform | Cost |
|--------------|----------|------|
| **VoiceOver** | macOS, iOS | Free (built-in) |
| **NVDA** | Windows | Free (open-source) |
| **JAWS** | Windows | Commercial (~$1,000/year) |
| **TalkBack** | Android | Free (built-in) |

Basic testing workflow:
1. Turn on the screen reader.
2. Navigate the page using Tab, arrow keys, and landmark shortcuts.
3. Verify that every interactive element is announced with its role, name, and state.
4. Verify that dynamic content changes (loading states, notifications, errors) are announced.
5. Verify that modals trap focus and announce their title.
6. Verify that route changes are announced.

---

## 9.6 Accessible Forms, Modals, Dropdowns

### Accessible Form Fields

Every form input must have an accessible label. The `<label>` element is the strongest association:

```javascript
function SignupForm() {
  const emailId = useId();
  const passwordId = useId();
  const [errors, setErrors] = useState({});

  return (
    <form noValidate>
      <div className="field">
        <label htmlFor={emailId}>Email address</label>
        <input
          id={emailId}
          type="email"
          name="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${emailId}-error` : undefined}
          autoComplete="email"
          required
        />
        {errors.email && (
          <p id={`${emailId}-error`} className="error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={passwordId}>Password</label>
        <input
          id={passwordId}
          type="password"
          name="password"
          aria-invalid={!!errors.password}
          aria-describedby={
            errors.password ? `${passwordId}-error` : `${passwordId}-hint`
          }
          autoComplete="new-password"
          required
        />
        <p id={`${passwordId}-hint`} className="hint">
          Must be at least 8 characters with one uppercase letter and one number.
        </p>
        {errors.password && (
          <p id={`${passwordId}-error`} className="error" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      <button type="submit">Create Account</button>
    </form>
  );
}
```

Key patterns:
- `htmlFor` (React's equivalent of HTML `for`) links the label to the input
- `aria-invalid` communicates the error state
- `aria-describedby` links the input to its error message or hint text
- Error messages use `role="alert"` to announce immediately
- `autoComplete` assists password managers and autofill

> **Common Mistake:** Using `placeholder` as a substitute for `<label>`. Placeholders disappear when the user starts typing, removing the field's identity. Screen readers may not consistently announce placeholder text. Always provide a visible `<label>` element. Placeholders should provide example formatting (e.g., "MM/DD/YYYY"), not serve as the field's name.

### Accessible Dropdown Menu

```javascript
function DropdownMenu({ label, items }) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  function open() {
    setIsOpen(true);
    setFocusedIndex(0);
  }

  function close() {
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  function handleButtonKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }

  function handleMenuKeyDown(e) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Escape":
        close();
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  }

  return (
    <div className="dropdown">
      <button
        ref={buttonRef}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleButtonKeyDown}
      >
        {label}
      </button>

      {isOpen && (
        <ul
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(el) => (itemRefs.current[index] = el)}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                item.onSelect();
                close();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  item.onSelect();
                  close();
                }
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Using Headless Libraries for Complex Widgets

Building fully accessible interactive widgets from scratch is complex and error-prone. For production applications, headless UI libraries (Radix UI, React Aria, Headless UI) provide WAI-ARIA compliant implementations:

```javascript
// Radix UI Dialog: fully accessible out of the box
import * as Dialog from "@radix-ui/react-dialog";

function ConfirmDialog({ trigger, title, description, onConfirm }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="btn-secondary">Cancel</button>
            </Dialog.Close>
            <button className="btn-danger" onClick={onConfirm}>
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Radix handles: focus trapping, Escape to close, aria-modal,
// aria-labelledby, focus restoration, and inert on siblings.
```

> **See Also:** Part 3, Chapter 3, Section 3.4 for the compound component pattern used by headless UI libraries.

---

## 9.7 Exercise: Audit and Fix Accessibility Issues in a Sample App

### Problem Statement

The following component has at least eight accessibility violations. Identify each issue, explain why it is a problem, and provide the corrected code.

### Starter Code (Inaccessible)

```javascript
function ProductPage({ product }) {
  const [showModal, setShowModal] = useState(false);
  const [quantity, setQuantity] = useState(1);

  return (
    <div>
      <div class="breadcrumb">
        <span onClick={() => navigate("/")}>Home</span> /
        <span onClick={() => navigate("/products")}>Products</span> /
        <span>{product.name}</span>
      </div>

      <img src={product.imageUrl} />

      <div class="title" style={{ fontSize: 24, fontWeight: "bold" }}>
        {product.name}
      </div>

      <div class="price">${product.price}</div>

      <div class="quantity">
        <div class="btn" onClick={() => setQuantity(q => Math.max(1, q - 1))}>-</div>
        <span>{quantity}</span>
        <div class="btn" onClick={() => setQuantity(q => q + 1)}>+</div>
      </div>

      <div class="add-to-cart" onClick={() => setShowModal(true)}>
        Add to Cart
      </div>

      {showModal && (
        <div class="overlay">
          <div class="modal">
            <div class="modal-title">Added to Cart</div>
            <p>{product.name} x {quantity} added.</p>
            <div class="btn" onClick={() => setShowModal(false)}>Close</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Solution (Accessible)

```javascript
function ProductPage({ product }) {
  const [showModal, setShowModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const addToCartRef = useRef(null);
  const quantityId = useId();

  function handleAddToCart() {
    setShowModal(true);
    setAnnouncement(`${product.name}, quantity ${quantity}, added to cart`);
  }

  return (
    // Fix 1: Use <main> for the primary content landmark
    <main>
      {/* Fix 2: Use <nav> with <a> links instead of clickable spans */}
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li><a href="/">Home</a></li>
          <li><a href="/products">Products</a></li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      {/* Fix 3: Add alt text to the image */}
      <img src={product.imageUrl} alt={`Photo of ${product.name}`} />

      {/* Fix 4: Use semantic heading instead of styled div */}
      <h1>{product.name}</h1>

      <p className="price">${product.price.toFixed(2)}</p>

      {/* Fix 5: Use buttons with aria-label for quantity controls */}
      <div className="quantity" role="group" aria-labelledby={quantityId}>
        <span id={quantityId} className="sr-only">Quantity</span>
        <button
          aria-label="Decrease quantity"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity <= 1}
        >
          -
        </button>
        <span aria-live="polite" aria-atomic="true">
          {quantity}
        </span>
        <button
          aria-label="Increase quantity"
          onClick={() => setQuantity((q) => q + 1)}
        >
          +
        </button>
      </div>

      {/* Fix 6: Use <button> for the add-to-cart action */}
      <button
        ref={addToCartRef}
        className="add-to-cart"
        onClick={handleAddToCart}
      >
        Add to Cart
      </button>

      {/* Fix 7: Accessible modal with dialog role, focus trap, Escape key */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Added to Cart"
        returnFocusRef={addToCartRef}
      >
        <p>{product.name} x {quantity} added to your cart.</p>
      </Modal>

      {/* Fix 8: Live region for screen reader announcement */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}

// Accessible Modal component (from Section 9.4)
function Modal({ isOpen, onClose, title, children, returnFocusRef }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
      document.getElementById("root")?.setAttribute("inert", "");
    }
    return () => {
      document.getElementById("root")?.removeAttribute("inert");
      if (!isOpen) returnFocusRef?.current?.focus();
    };
  }, [isOpen, returnFocusRef]);

  useEffect(() => {
    if (!isOpen) return;
    function onEscape(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
        tabIndex={-1}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-heading">{title}</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

### Issues Fixed

| # | Issue | Violation | Fix |
|---|-------|-----------|-----|
| 1 | No landmark structure | WCAG 1.3.1 | Wrapped content in `<main>`, breadcrumb in `<nav>` |
| 2 | Clickable `<span>` for navigation | WCAG 2.1.1 | Replaced with `<a>` links in a proper breadcrumb `<ol>` |
| 3 | Image missing alt text | WCAG 1.1.1 | Added descriptive `alt` attribute |
| 4 | Styled `<div>` as heading | WCAG 1.3.1 | Replaced with `<h1>` |
| 5 | `<div>` used as interactive buttons | WCAG 4.1.2 | Replaced with `<button>` elements with `aria-label` |
| 6 | "Add to Cart" is a `<div>`, not a `<button>` | WCAG 4.1.2 | Replaced with `<button>` |
| 7 | Modal has no `role="dialog"`, no focus trap, no Escape key | WCAG 2.4.3, 1.3.1 | Added dialog role, focus management, inert, Escape handler |
| 8 | No screen reader announcement for cart addition | WCAG 4.1.3 | Added `aria-live="polite"` region |

### Key Takeaway

Accessibility is not a separate feature bolted on after development. It is a quality of the markup and interaction design that emerges from using semantic HTML elements, providing text alternatives for non-text content, managing keyboard focus, and communicating state changes to assistive technology. The majority of violations (missing labels, `<div>` instead of `<button>`, missing alt text) are preventable by using native HTML elements correctly. For complex widgets (modals, comboboxes, tab panels), headless UI libraries provide production-quality accessible implementations that would take weeks to build and test from scratch.

---

## Chapter Summary

React accessibility begins with semantic HTML: using `<button>` for actions, `<a>` for navigation, landmark elements for page structure, and `<label>` for form fields. ARIA attributes should supplement, not replace, native semantics. Keyboard navigation requires roving tabindex for composite widgets, visible focus indicators, and support for Escape, Arrow, and Tab keys. Focus management in SPAs includes route change announcements, focus trapping in modals (using the `inert` attribute), and focus restoration when dialogs close. Automated testing (eslint-plugin-jsx-a11y, axe-core, Testing Library's role-based queries) catches 30-50% of issues; manual screen reader testing is essential for the remaining barriers. For complex interactive widgets, headless UI libraries (Radix, React Aria) provide WAI-ARIA compliant implementations that handle focus, keyboard, and screen reader behavior correctly.

## Further Reading

- [ARIA Authoring Practices Guide (W3C)](https://www.w3.org/WAI/ARIA/apg/) — reference implementations for accessible widgets
- [Accessibility (React Legacy Documentation)](https://legacy.reactjs.org/docs/accessibility.html) — React-specific accessibility guidance
- [The First Rule of ARIA (W3C)](https://www.w3.org/TR/using-aria/#rule1) — when to use (and not use) ARIA
- [eslint-plugin-jsx-a11y (GitHub)](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) — static accessibility linting for JSX
- [Testing Library: ByRole Query](https://testing-library.com/docs/queries/byrole/) — accessibility-first testing queries
- [React Aria (Adobe)](https://react-spectrum.adobe.com/react-aria/) — hooks for building accessible React components
