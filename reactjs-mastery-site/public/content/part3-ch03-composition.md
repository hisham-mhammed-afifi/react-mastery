# Part 3, Chapter 3: Component Composition Patterns

## What You Will Learn

- Identify when prop drilling is acceptable (2-3 levels, stable structure) and when it signals a structural problem requiring a composition solution
- Apply the "inversion of control" technique to eliminate prop drilling without introducing Context
- Implement the slots pattern using named props for multi-region layouts
- Build compound components that share implicit state through Context, following the patterns used by Radix UI and Headless UI
- Apply the render props pattern for cases where a library needs to control the rendering boundary
- Evaluate HOCs, render props, and custom hooks against a concrete decision matrix to select the right abstraction
- Refactor a prop-drilling component using three distinct composition strategies

---

## 3.1 Props Drilling: The Problem and When It's Actually Fine

Prop drilling is the practice of passing data through multiple layers of components, where intermediate components receive props solely to forward them to deeper descendants.

```javascript
function App() {
  const [user, setUser] = useState({ name: "Alice", role: "admin" });

  return <Layout user={user} />;
}

function Layout({ user }) {
  // Layout does not use `user`; it just forwards it
  return (
    <div className="layout">
      <Sidebar user={user} />
      <Content user={user} />
    </div>
  );
}

function Sidebar({ user }) {
  // Sidebar also just forwards `user`
  return (
    <nav>
      <UserBadge user={user} />
    </nav>
  );
}

function UserBadge({ user }) {
  // This is the only component that actually uses `user`
  return <span className="badge">{user.name} ({user.role})</span>;
}
```

### When Prop Drilling Is Fine

Prop drilling through 2-3 levels is not a problem. It provides **explicit data flow**: any developer reading the code can trace where data comes from by following props upward. This explicitness is valuable during debugging and code review.

Prop drilling is appropriate when:

- The component tree is shallow (2-3 levels between owner and consumer).
- The intermediate components are not reusable; they exist because a large component was split for readability.
- The data is used by most components along the path (each component uses the prop, not just the leaf).

### When Prop Drilling Becomes a Problem

- **Threading through many levels.** When props pass through 4+ components that do not use them, the intermediate components become coupled to data they do not need. Adding a new prop to the leaf component requires modifying every component in the chain.
- **Multiple unrelated props threaded together.** When an intermediate component forwards `user`, `theme`, `locale`, `permissions`, and `notifications`, its prop interface becomes a grab-bag of unrelated concerns.
- **Refactoring resistance.** Moving a component to a different position in the tree requires rewiring every prop along the new path.

---

## 3.2 Component Composition: Solving Prop Drilling Without Context

The React documentation recommends composition as the first solution to prop drilling, before reaching for Context: "If you only want to avoid passing some props through many levels, component composition is often a simpler solution than context."

The technique is **inversion of control**: instead of passing data down through intermediaries, lift the component that needs the data up to the level where the data exists, and pass the entire component (as `children` or a prop) through the intermediaries.

### Before: Prop Drilling

```javascript
function App() {
  const user = useCurrentUser();

  return <Page user={user} />;
}

function Page({ user }) {
  return (
    <main>
      <Header user={user} />
      <Dashboard user={user} />
    </main>
  );
}

function Header({ user }) {
  return (
    <header>
      <Logo />
      <Navigation />
      <UserMenu user={user} /> {/* Only UserMenu needs user */}
    </header>
  );
}
```

### After: Composition (Inversion of Control)

```javascript
function App() {
  const user = useCurrentUser();

  // App creates UserMenu directly (it has the data)
  // and passes it as a prop to the intermediaries
  return (
    <Page
      header={
        <Header userMenu={<UserMenu user={user} />} />
      }
    >
      <Dashboard user={user} />
    </Page>
  );
}

function Page({ header, children }) {
  // Page never sees `user`; it just renders what it is given
  return (
    <main>
      {header}
      {children}
    </main>
  );
}

function Header({ userMenu }) {
  // Header never sees `user`; it just places the menu
  return (
    <header>
      <Logo />
      <Navigation />
      {userMenu}
    </header>
  );
}
```

`Page` and `Header` are now decoupled from the `user` data. They accept pre-built components as props, placing them in the correct layout positions without knowing their contents. If `UserMenu` later needs additional data (permissions, notifications), only `App` changes; the intermediaries remain untouched.

> **Common Mistake:** Developers often jump directly to Context when they encounter prop drilling. Context adds complexity: it couples consumers to a specific provider, can cause unnecessary re-renders, and makes components harder to reuse outside the provider tree. Composition via `children` and named props solves most prop-drilling cases without these costs. Reserve Context for truly cross-cutting concerns (theme, locale, authentication) that every component in the tree might need.

---

## 3.3 Slots Pattern: Named Children Regions

The slots pattern extends basic composition by providing multiple named insertion points in a component's layout. While React has no built-in `<slot>` element (unlike Vue or Web Components), named props achieve the same result.

```javascript
function Dialog({ title, actions, children }) {
  return (
    <div className="dialog-overlay">
      <div className="dialog" role="dialog" aria-labelledby="dialog-title">
        {/* Title slot */}
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
        </header>

        {/* Default slot (children) */}
        <div className="dialog-body">{children}</div>

        {/* Actions slot */}
        {actions && (
          <footer className="dialog-footer">{actions}</footer>
        )}
      </div>
    </div>
  );
}

// Consumer fills each slot independently
function ConfirmDeleteDialog({ itemName, onConfirm, onCancel }) {
  return (
    <Dialog
      title={`Delete ${itemName}?`}
      actions={
        <>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </>
      }
    >
      <p>
        This action cannot be undone. All data associated with
        "{itemName}" will be permanently removed.
      </p>
    </Dialog>
  );
}
```

### Multi-Region Layout with Slots

```javascript
function AppShell({ navigation, sidebar, footer, children }) {
  return (
    <div className="app-shell">
      <nav className="app-nav">{navigation}</nav>
      <div className="app-body">
        {sidebar && <aside className="app-sidebar">{sidebar}</aside>}
        <main className="app-content">{children}</main>
      </div>
      <footer className="app-footer">{footer}</footer>
    </div>
  );
}

function DashboardPage() {
  return (
    <AppShell
      navigation={<TopNav />}
      sidebar={<DashboardSidebar />}
      footer={<FooterLinks />}
    >
      <DashboardContent />
    </AppShell>
  );
}

function SettingsPage() {
  return (
    <AppShell
      navigation={<TopNav />}
      sidebar={null}  {/* No sidebar on settings page */}
      footer={<FooterLinks />}
    >
      <SettingsForm />
    </AppShell>
  );
}
```

The `AppShell` component defines the layout structure. Each page fills the slots with page-specific content. The layout logic is centralized; the content decisions are distributed.

> **See Also:** Part 3, Chapter 1, Section 1.7 for the foundational children-as-a-prop composition pattern that slots build upon.

---

## 3.4 Compound Components: Components That Work Together

Compound components are a set of components that share implicit state through a common parent. The parent provides state via Context; children consume it without explicit prop passing. This pattern mirrors native HTML elements like `<select>` and `<option>`, where the `<select>` manages the selected value and each `<option>` participates in the selection without manual wiring.

### Building a Tabs Component

```javascript
import { createContext, useContext, useState } from "react";

// 1. Create the shared context
const TabsContext = createContext(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (context === null) {
    throw new Error("Tabs compound components must be used within <Tabs>");
  }
  return context;
}

// 2. Parent component: owns state, provides context
function Tabs({ defaultValue, children }) {
  const [activeTab, setActiveTab] = useState(defaultValue);

  const contextValue = useMemo(
    () => ({ activeTab, setActiveTab }),
    [activeTab]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

// 3. Child components: consume context
function TabList({ children }) {
  return (
    <div className="tab-list" role="tablist">
      {children}
    </div>
  );
}

function Tab({ value, children }) {
  const { activeTab, setActiveTab } = useTabs();
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={`tab ${isActive ? "tab-active" : ""}`}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }) {
  const { activeTab } = useTabs();

  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className="tab-panel">
      {children}
    </div>
  );
}

// 4. Usage: clean, declarative API
function ProductDetails() {
  return (
    <Tabs defaultValue="description">
      <TabList>
        <Tab value="description">Description</Tab>
        <Tab value="specs">Specifications</Tab>
        <Tab value="reviews">Reviews</Tab>
      </TabList>

      <TabPanel value="description">
        <p>Premium wireless headphones with active noise cancellation.</p>
      </TabPanel>
      <TabPanel value="specs">
        <SpecificationTable />
      </TabPanel>
      <TabPanel value="reviews">
        <ReviewList />
      </TabPanel>
    </Tabs>
  );
}
```

### Why Context Over cloneElement

The older compound component approach used `React.Children.map` with `React.cloneElement` to inject props into children. This approach has significant limitations:

```javascript
// Legacy approach (fragile, not recommended)
function LegacyTabs({ children, defaultValue }) {
  const [active, setActive] = useState(defaultValue);

  return (
    <div>
      {React.Children.map(children, (child) => {
        // Only works with DIRECT children
        // Breaks if children are wrapped in a Fragment, div, or other component
        return React.cloneElement(child, { active, setActive });
      })}
    </div>
  );
}
```

The Context-based approach works regardless of nesting depth. Children can be wrapped in fragments, divs, or intermediate components, and they will still access the shared state via `useContext`.

### How Headless Libraries Use This Pattern

Modern headless UI libraries (Radix UI, Headless UI, React Aria) are built entirely on compound components with Context. Each primitive (Dialog, Popover, Accordion, Tabs) exports a root component and sub-components:

```javascript
// Radix UI pattern (conceptual; not exact API)
import * as Dialog from "@radix-ui/react-dialog";

function ConfirmDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>Delete Account</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Are you sure?</Dialog.Title>
          <Dialog.Description>This action is irreversible.</Dialog.Description>
          <Dialog.Close asChild>
            <button>Cancel</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

The consumer controls the rendering (what elements, what classes, what styles). The library controls the behavior (focus management, keyboard interactions, ARIA attributes, open/close state).

---

## 3.5 Render Props Pattern: Sharing Behavior via Functions

The render props pattern passes a function as a prop (or as `children`). The component calls this function with data or behavior, and the function returns JSX. This gives the consuming component control over what renders while the provider component controls when and with what data.

```javascript
// A component that tracks mouse position and shares it via render prop
function MouseTracker({ children }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMove(event) {
      setPosition({ x: event.clientX, y: event.clientY });
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  // Call the children function with the position data
  return children(position);
}

// Consumer decides how to render the data
function HeatMap() {
  return (
    <MouseTracker>
      {({ x, y }) => (
        <div
          className="heat-dot"
          style={{
            position: "fixed",
            left: x - 10,
            top: y - 10,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "rgba(255, 0, 0, 0.3)",
          }}
        />
      )}
    </MouseTracker>
  );
}
```

### When Render Props Are Still Relevant

Custom hooks have replaced render props for most logic-sharing use cases. However, render props remain valuable in specific scenarios:

**1. Rendering boundaries.** When a library needs to control the rendering context (virtualization, intersection observation) and inject rendering behavior:

```javascript
// Virtualized list: the library controls which items are visible
// and renders only those, but the consumer controls how each item looks
function VirtualList({ items, itemHeight, containerHeight, renderItem }) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    items.length,
    startIndex + Math.ceil(containerHeight / itemHeight) + 1
  );

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      style={{ height: containerHeight, overflow: "auto" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        {visibleItems.map((item, i) => (
          <div
            key={item.id}
            style={{
              position: "absolute",
              top: (startIndex + i) * itemHeight,
              height: itemHeight,
              width: "100%",
            }}
          >
            {renderItem(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Consumer controls the rendering of each item
function ProductList({ products }) {
  return (
    <VirtualList
      items={products}
      itemHeight={60}
      containerHeight={400}
      renderItem={(product, index) => (
        <div className="product-row">
          <span>{index + 1}.</span>
          <span>{product.name}</span>
          <span>${product.price.toFixed(2)}</span>
        </div>
      )}
    />
  );
}
```

**2. Conditional rendering with data.** When a component needs to provide data that determines both whether and what to render:

```javascript
function Feature({ flag, children }) {
  const features = useFeatureFlags();
  const isEnabled = features[flag];

  if (!isEnabled) return null;
  return typeof children === "function" ? children(features) : children;
}

// Usage with render prop: access feature data in the render
<Feature flag="newDashboard">
  {(features) => (
    <Dashboard version={features.newDashboard.variant} />
  )}
</Feature>
```

---

## 3.6 HOCs (Higher-Order Components): When Hooks Aren't Enough

A Higher-Order Component is a function that takes a component and returns a new component with additional behavior. HOCs were the primary code-reuse mechanism before hooks.

```javascript
// withErrorBoundary: wraps a component in an error boundary
function withErrorBoundary(Component, FallbackComponent) {
  return function WithErrorBoundary(props) {
    return (
      <ErrorBoundary fallback={<FallbackComponent />}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Usage: wrap at export
function Dashboard() {
  return <div>{/* dashboard content */}</div>;
}

export default withErrorBoundary(Dashboard, DashboardError);
```

### Remaining Use Cases for HOCs

**Error boundaries.** Error boundaries require class components (`componentDidCatch`, `getDerivedStateFromError`). A HOC is the cleanest way to wrap function components in error boundaries.

**Authentication gates.** Redirecting unauthenticated users is a cross-cutting concern that applies uniformly:

```javascript
function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    const { user, loading } = useAuth();

    if (loading) return <Spinner />;
    if (!user) {
      window.location.href = "/login";
      return null;
    }

    return <Component {...props} user={user} />;
  };
}

const ProtectedDashboard = withAuth(Dashboard);
```

**Logging and instrumentation.** Wrapping components with performance tracking or analytics:

```javascript
function withPerformanceTracking(Component, componentName) {
  return function TrackedComponent(props) {
    useEffect(() => {
      const start = performance.now();
      return () => {
        const duration = performance.now() - start;
        analytics.track("component_lifetime", {
          component: componentName,
          duration,
        });
      };
    }, []);

    return <Component {...props} />;
  };
}
```

### HOC Pitfalls

- **Wrapper hell.** `withAuth(withTheme(withLogger(withErrorBoundary(Component))))` creates four wrapper layers in the component tree.
- **Prop collision.** Two HOCs might inject props with the same name, silently overwriting each other.
- **Lost static methods.** HOCs do not automatically copy static methods from the wrapped component.
- **Opaque data flow.** It is difficult to trace which props come from which HOC without reading the HOC source code.

> **Common Mistake:** Developers sometimes create HOCs inside other components' render functions. Because each render produces a new HOC wrapper (new function reference), React sees a different component type every render and unmounts/remounts the entire subtree, destroying all state. HOCs must be created outside the render path, typically at module level or export time.

---

## 3.7 Custom Hooks vs HOCs vs Render Props: Decision Matrix

| Criterion | Custom Hooks | Render Props | HOCs |
|-----------|-------------|-------------|------|
| **Logic sharing** | Best (direct, composable) | Good (but adds nesting) | Good (but wrapper layers) |
| **Rendering control** | No (hook returns data; component renders) | Yes (function controls rendering) | Partial (wraps the component) |
| **Multiple instances** | Call the hook multiple times | Nest multiple render props | Compose multiple HOCs |
| **Nesting depth** | None (hooks are flat calls) | One wrapper per render prop | One wrapper per HOC |
| **Prop collisions** | Impossible (hook returns named values) | Unlikely (render function controls names) | Possible (injected props may collide) |
| **Debugging** | Clear (hook output visible in DevTools) | Moderate (anonymous function in tree) | Difficult (wrapper components in tree) |
| **TypeScript support** | Excellent | Good | Complex (generic inference issues) |
| **Use in class components** | Not possible | Yes | Yes |

### The Decision Algorithm

1. **Default to custom hooks.** They are the simplest, most composable abstraction with no rendering overhead.
2. **Use render props** when a library or component needs to control the rendering boundary (virtualized lists, animation frames, intersection observers) or when you need the pattern in a class component.
3. **Use HOCs** for cross-cutting concerns applied declaratively at the component boundary (error boundaries, auth gates, logging), especially when they must wrap the component at export time.
4. **Combine them.** A library can offer both a hook and a render-prop component. Downshift, for example, provides `useCombobox` (hook) alongside `<Downshift>` (render prop) for different consumer preferences.

---

## 3.8 Exercise: Refactor a Prop-Drilling Component 3 Different Ways

### Problem Statement

The following component passes `user` and `onLogout` through four levels of nesting. Refactor it using three different strategies: (A) composition via children, (B) Context, and (C) a custom hook. Compare the trade-offs of each approach.

### Starter Code (Prop Drilling)

```javascript
function App() {
  const [user, setUser] = useState({ name: "Alice", email: "alice@example.com" });

  function handleLogout() {
    setUser(null);
  }

  return <Page user={user} onLogout={handleLogout} />;
}

function Page({ user, onLogout }) {
  return (
    <div className="page">
      <Header user={user} onLogout={onLogout} />
      <main>
        <h1>Welcome back</h1>
      </main>
    </div>
  );
}

function Header({ user, onLogout }) {
  return (
    <header>
      <Logo />
      <nav>
        <NavLinks />
        <UserMenu user={user} onLogout={onLogout} />
      </nav>
    </header>
  );
}

function UserMenu({ user, onLogout }) {
  if (!user) return <a href="/login">Sign In</a>;
  return (
    <div className="user-menu">
      <span>{user.name}</span>
      <button onClick={onLogout}>Log Out</button>
    </div>
  );
}
```

### Solution A: Composition via Children

```javascript
function App() {
  const [user, setUser] = useState({ name: "Alice", email: "alice@example.com" });
  const handleLogout = () => setUser(null);

  // App creates UserMenu directly (it owns the data)
  // and passes the fully-built component through the tree
  return (
    <Page
      header={
        <Header
          userMenu={<UserMenu user={user} onLogout={handleLogout} />}
        />
      }
    >
      <h1>Welcome back</h1>
    </Page>
  );
}

function Page({ header, children }) {
  // Page has no knowledge of user or onLogout
  return (
    <div className="page">
      {header}
      <main>{children}</main>
    </div>
  );
}

function Header({ userMenu }) {
  // Header has no knowledge of user or onLogout
  return (
    <header>
      <Logo />
      <nav>
        <NavLinks />
        {userMenu}
      </nav>
    </header>
  );
}

// UserMenu is unchanged
function UserMenu({ user, onLogout }) {
  if (!user) return <a href="/login">Sign In</a>;
  return (
    <div className="user-menu">
      <span>{user.name}</span>
      <button onClick={onLogout}>Log Out</button>
    </div>
  );
}
```

**Trade-offs:** No new dependencies or abstractions. Intermediaries are fully decoupled. However, the top-level component becomes more complex as it assembles the composition.

### Solution B: Context

```javascript
const UserContext = createContext(null);

function UserProvider({ children }) {
  const [user, setUser] = useState({ name: "Alice", email: "alice@example.com" });
  const handleLogout = useCallback(() => setUser(null), []);

  const value = useMemo(() => ({ user, logout: handleLogout }), [user, handleLogout]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

function useUser() {
  const context = useContext(UserContext);
  if (context === null) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

function App() {
  return (
    <UserProvider>
      <Page />
    </UserProvider>
  );
}

function Page() {
  return (
    <div className="page">
      <Header />
      <main><h1>Welcome back</h1></main>
    </div>
  );
}

function Header() {
  return (
    <header>
      <Logo />
      <nav>
        <NavLinks />
        <UserMenu />
      </nav>
    </header>
  );
}

function UserMenu() {
  const { user, logout } = useUser();

  if (!user) return <a href="/login">Sign In</a>;
  return (
    <div className="user-menu">
      <span>{user.name}</span>
      <button onClick={logout}>Log Out</button>
    </div>
  );
}
```

**Trade-offs:** Clean intermediate components with no prop forwarding. However, `UserMenu` is now coupled to `UserContext` and cannot be reused outside a `UserProvider`. Every consumer re-renders when any part of the context value changes.

### Solution C: Custom Hook

```javascript
// The hook encapsulates the auth state management
function useAuth() {
  const [user, setUser] = useState({ name: "Alice", email: "alice@example.com" });

  const logout = useCallback(() => setUser(null), []);

  return { user, logout };
}

// Each component that needs auth calls the hook directly
function App() {
  return (
    <div className="page">
      <Header />
      <main><h1>Welcome back</h1></main>
    </div>
  );
}

function Header() {
  return (
    <header>
      <Logo />
      <nav>
        <NavLinks />
        <UserMenu />
      </nav>
    </header>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return <a href="/login">Sign In</a>;
  return (
    <div className="user-menu">
      <span>{user.name}</span>
      <button onClick={logout}>Log Out</button>
    </div>
  );
}
```

**Trade-offs:** Clean and simple, but each `useAuth` call creates independent state. If `App` and `UserMenu` both call `useAuth`, they have separate `user` states that do not synchronize. To share state, the hook must be backed by Context (Solution B) or an external store.

### Comparison Table

| Aspect | Composition | Context | Custom Hook (alone) |
|--------|------------|---------|-------------------|
| Intermediary coupling | None | None | None |
| State sharing | Via props at top level | Via Provider | Each call is independent (requires Context or external store for sharing) |
| Reusability of leaf component | High (accepts props) | Medium (coupled to Context) | High (hook is reusable) |
| Complexity added | Low (rearrange JSX) | Medium (Provider, custom hook, useMemo) | Low (just a function) |
| Appropriate for | Stable layouts, 3-4 level drilling | Cross-cutting concerns (auth, theme) | Logic extraction (not state sharing alone) |

### Key Takeaway

No single approach is universally superior. Composition via children is the simplest solution and should be tried first. Context is appropriate when the same data is needed by many components at various depths. Custom hooks extract logic but do not share state between components unless combined with Context or an external store. Senior React developers choose the minimal abstraction that solves the problem: composition for layout, Context for cross-cutting data, hooks for reusable logic, HOCs for declarative wrappers, and render props for rendering boundaries.

---

## Chapter Summary

Component composition patterns form a spectrum of increasing abstraction: basic composition via `children` and named props eliminates most prop drilling without introducing new dependencies. The slots pattern provides multi-region layouts through named props. Compound components share implicit state through Context, enabling declarative APIs modeled after native HTML elements. Render props remain relevant for rendering boundaries where a library must control what renders. HOCs serve cross-cutting concerns (error boundaries, auth gates) applied at the component boundary. Custom hooks are the default choice for logic sharing, replacing both render props and HOCs for the vast majority of use cases. The decision matrix comes down to one question: does the abstraction need to control rendering (render props, HOCs) or just share data and logic (hooks)?

## Further Reading

- [Prop Drilling (Kent C. Dodds)](https://kentcdodds.com/blog/prop-drilling) — when drilling is fine and when to look for alternatives
- [Inversion of Control (Kent C. Dodds)](https://kentcdodds.com/blog/inversion-of-control) — the principle behind composition solutions
- [Compound Components with React Hooks (Kent C. Dodds)](https://kentcdodds.com/blog/compound-components-with-react-hooks) — the Context-based compound component pattern
- [Advanced React Component Composition Guide (Frontend Mastery)](https://frontendmastery.com/posts/advanced-react-component-composition-guide/) — comprehensive composition strategies
- [Composition (Radix UI)](https://www.radix-ui.com/primitives/docs/guides/composition) — how a production headless library uses composition
- [What's Going to Happen to Render Props? (Kent C. Dodds)](https://kentcdodds.com/blog/react-hooks-whats-going-to-happen-to-render-props) — when render props are still the right choice
