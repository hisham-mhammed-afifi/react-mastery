# Part 4, Chapter 3: Advanced Component Patterns

## What You Will Learn

- Build compound components using Context that support arbitrary nesting depth, and expose them via dot-notation or named exports
- Implement polymorphic components with the `as` prop and the newer `asChild`/Slot pattern used by Radix UI and shadcn/ui
- Design headless components that encapsulate behavior and accessibility without imposing any visual constraints
- Apply the controlled/uncontrolled duality with state reducers to give consumers fine-grained control over component behavior
- Construct prop collections and prop getters that merge consumer handlers with internal logic safely
- Architect a Provider-based feature flag system that conditionally renders UI branches and guards code paths
- Implement the registry pattern for plugin systems that support dynamic component registration and zone-based rendering

---

## 3.1 Compound Components (Tabs, Accordion, Select)

Compound components are a set of components that cooperate through shared implicit state. The parent orchestrates behavior; children participate in it. This pattern mirrors native HTML elements such as `<select>` and `<option>`, where the parent manages the selected value and each child contributes an option without manual wiring.

> **See Also:** Part 3, Chapter 3, Section 3.4 for the foundational introduction to compound components and the Context-based approach. This section builds on that foundation with production-grade implementations.

### Tabs: A Complete Implementation

A Tabs compound component requires four sub-components: a root `Tabs` that holds state, a `TabList` that groups trigger buttons, individual `Tab` triggers, and `TabPanel` content regions. The implementation must manage active index, keyboard navigation, and ARIA attributes.

```javascript
import { createContext, useContext, useState, useRef, useCallback } from "react";

const TabsContext = createContext(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs compound components must be rendered within <Tabs>");
  }
  return context;
}

function Tabs({ children, defaultIndex = 0, onChange }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const tabRefs = useRef([]);

  const selectTab = useCallback((index) => {
    setActiveIndex(index);
    onChange?.(index);
  }, [onChange]);

  const registerTabRef = useCallback((index, element) => {
    tabRefs.current[index] = element;
  }, []);

  const focusTab = useCallback((index) => {
    tabRefs.current[index]?.focus();
  }, []);

  return (
    <TabsContext.Provider value={{
      activeIndex,
      selectTab,
      registerTabRef,
      focusTab,
      tabRefs
    }}>
      {children}
    </TabsContext.Provider>
  );
}

function TabList({ children, label }) {
  const { activeIndex, selectTab, focusTab, tabRefs } = useTabs();
  const tabCount = tabRefs.current.length || 0;

  const handleKeyDown = (event) => {
    const lastIndex = tabCount - 1;
    let nextIndex = activeIndex;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = activeIndex >= lastIndex ? 0 : activeIndex + 1;
        break;
      case "ArrowLeft":
        nextIndex = activeIndex <= 0 ? lastIndex : activeIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectTab(nextIndex);
    focusTab(nextIndex);
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}

function Tab({ index, children }) {
  const { activeIndex, selectTab, registerTabRef } = useTabs();
  const isActive = activeIndex === index;

  return (
    <button
      role="tab"
      id={`tab-${index}`}
      aria-selected={isActive}
      aria-controls={`tabpanel-${index}`}
      tabIndex={isActive ? 0 : -1}
      ref={(el) => registerTabRef(index, el)}
      onClick={() => selectTab(index)}
    >
      {children}
    </button>
  );
}

function TabPanel({ index, children }) {
  const { activeIndex } = useTabs();
  const isActive = activeIndex === index;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
```

Usage is declarative and mirrors the logical structure of the UI:

```javascript
function SettingsPage() {
  return (
    <Tabs defaultIndex={0} onChange={(i) => console.log("Active tab:", i)}>
      <TabList label="Settings sections">
        <Tab index={0}>Profile</Tab>
        <Tab index={1}>Security</Tab>
        <Tab index={2}>Notifications</Tab>
      </TabList>
      <TabPanel index={0}><ProfileSettings /></TabPanel>
      <TabPanel index={1}><SecuritySettings /></TabPanel>
      <TabPanel index={2}><NotificationSettings /></TabPanel>
    </Tabs>
  );
}
```

### Accordion: Shared Pattern, Different State

An Accordion follows the same compound component architecture but manages a set of open panels rather than a single active index. The key design decision is whether the accordion allows multiple panels open simultaneously.

```javascript
const AccordionContext = createContext(null);

function useAccordion() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be rendered within <Accordion>");
  }
  return context;
}

function Accordion({ children, allowMultiple = false }) {
  const [openPanels, setOpenPanels] = useState(new Set());

  const togglePanel = useCallback((id) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  }, [allowMultiple]);

  const isOpen = useCallback((id) => openPanels.has(id), [openPanels]);

  return (
    <AccordionContext.Provider value={{ togglePanel, isOpen }}>
      <div role="presentation">{children}</div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ id, children }) {
  return <div data-accordion-item>{children(id)}</div>;
}

function AccordionTrigger({ id, children }) {
  const { togglePanel, isOpen } = useAccordion();
  const expanded = isOpen(id);

  return (
    <h3>
      <button
        aria-expanded={expanded}
        aria-controls={`accordion-panel-${id}`}
        id={`accordion-trigger-${id}`}
        onClick={() => togglePanel(id)}
      >
        {children}
        <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
      </button>
    </h3>
  );
}

function AccordionPanel({ id, children }) {
  const { isOpen } = useAccordion();
  const expanded = isOpen(id);

  return (
    <div
      role="region"
      id={`accordion-panel-${id}`}
      aria-labelledby={`accordion-trigger-${id}`}
      hidden={!expanded}
    >
      {expanded ? children : null}
    </div>
  );
}
```

### Export Strategies: Dot Notation vs Named Exports

Two export conventions exist for compound components. Each carries distinct tradeoffs.

**Dot notation** attaches sub-components as properties of the parent:

```javascript
// Definition
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

export { Tabs };

// Usage
<Tabs>
  <Tabs.List label="Settings">
    <Tabs.Tab index={0}>Profile</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel index={0}>Content</Tabs.Panel>
</Tabs>
```

**Named exports** expose each sub-component individually:

```javascript
export { Tabs, TabList, Tab, TabPanel };

// Usage
<Tabs>
  <TabList label="Settings">
    <Tab index={0}>Profile</Tab>
  </TabList>
  <TabPanel index={0}>Content</TabPanel>
</Tabs>
```

| Consideration | Dot Notation | Named Exports |
|---|---|---|
| Discoverability | High: autocomplete reveals all parts | Lower: consumer must know the names |
| Tree-shaking | Unreliable: bundlers may include all sub-components | Reliable: unused exports can be eliminated |
| Naming collisions | Eliminated: `Tabs.Tab` cannot collide | Possible: `Tab` may conflict with other imports |
| Testing | Single import for all parts | Individual imports simplify unit testing |

Libraries like Chakra UI and Mantine use dot notation. Libraries like Radix UI and Headless UI use named exports. For application code, either approach works; for published libraries, named exports provide better tree-shaking guarantees.

> **Common Mistake:** Using `React.Children.map` with `React.cloneElement` instead of Context for compound components. The `cloneElement` approach breaks when any wrapper element sits between the parent and its compound children. React's documentation now lists `cloneElement` as a legacy API. Always prefer Context for compound component state sharing.

---

## 3.2 Flexible Compound Components with Context

The term "flexible compound components" describes compound components built with Context rather than `cloneElement`. This section examines the architectural decisions that make Context-based compound components robust in production.

### Context Value Memoization

Every object or array passed as a Context value creates a new reference on each render. Because Context triggers re-renders in all consumers when the value changes by reference, unmemoized Context values cause every compound child to re-render on every parent render.

```javascript
// Problem: new object every render
function Tabs({ children, defaultIndex = 0 }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  return (
    <TabsContext.Provider value={{ activeIndex, setActiveIndex }}>
      {children}
    </TabsContext.Provider>
  );
}

// Solution: memoize the context value
function Tabs({ children, defaultIndex = 0 }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const selectTab = useCallback((index) => setActiveIndex(index), []);

  const contextValue = useMemo(
    () => ({ activeIndex, selectTab }),
    [activeIndex, selectTab]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      {children}
    </TabsContext.Provider>
  );
}
```

### Splitting Read and Write Contexts

For compound components with many consumers, splitting the Context into a "state" context (read) and a "dispatch" context (write) prevents unnecessary re-renders. Components that only dispatch actions (such as trigger buttons in a distant part of the tree) do not need to re-render when the state value changes.

```javascript
const TabsStateContext = createContext(null);
const TabsDispatchContext = createContext(null);

function useTabsState() {
  const context = useContext(TabsStateContext);
  if (!context) throw new Error("Must be used within <Tabs>");
  return context;
}

function useTabsDispatch() {
  const context = useContext(TabsDispatchContext);
  if (!context) throw new Error("Must be used within <Tabs>");
  return context;
}

function Tabs({ children, defaultIndex = 0, onChange }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  const dispatch = useMemo(
    () => ({
      selectTab: (index) => {
        setActiveIndex(index);
        onChange?.(index);
      },
    }),
    [onChange]
  );

  const state = useMemo(
    () => ({ activeIndex }),
    [activeIndex]
  );

  return (
    <TabsStateContext.Provider value={state}>
      <TabsDispatchContext.Provider value={dispatch}>
        {children}
      </TabsDispatchContext.Provider>
    </TabsStateContext.Provider>
  );
}
```

> **See Also:** Part 3, Chapter 4, Section 4.6 for a detailed discussion of why Context re-renders all consumers and the splitting pattern.

### Index-Free Registration with `useId`

Requiring consumers to manually assign `index` props to each Tab and TabPanel is error-prone. A more robust approach uses automatic registration. Each Tab registers itself with the parent and receives an auto-generated identifier via `useId`.

```javascript
import { createContext, useContext, useState, useRef, useCallback, useId } from "react";

const TabsContext = createContext(null);

function Tabs({ children, onChange }) {
  const [activeId, setActiveId] = useState(null);
  const tabsRef = useRef([]);
  const isFirstRender = useRef(true);

  const register = useCallback((id) => {
    tabsRef.current = [...tabsRef.current, id];
    return () => {
      tabsRef.current = tabsRef.current.filter((tabId) => tabId !== id);
    };
  }, []);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    onChange?.(id);
  }, [onChange]);

  // Activate the first tab on initial render
  if (isFirstRender.current && tabsRef.current.length > 0) {
    isFirstRender.current = false;
    setActiveId(tabsRef.current[0]);
  }

  const value = useMemo(
    () => ({ activeId, selectTab, register, tabs: tabsRef }),
    [activeId, selectTab, register]
  );

  return (
    <TabsContext.Provider value={value}>
      {children}
    </TabsContext.Provider>
  );
}

function Tab({ children }) {
  const id = useId();
  const { activeId, selectTab, register } = useContext(TabsContext);

  // Register on mount, deregister on unmount
  useState(() => {
    const cleanup = register(id);
    return cleanup;
  });

  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={activeId === id}
      aria-controls={`panel-${id}`}
      tabIndex={activeId === id ? 0 : -1}
      onClick={() => selectTab(id)}
    >
      {children}
    </button>
  );
}
```

This approach eliminates the manual `index` prop, making the component resilient to reordering and conditional rendering of tabs.

> **Common Mistake:** Storing mutable state (like a tab registry) in a `useRef` without triggering a re-render when it changes. The `useRef` value does not cause re-renders when mutated. For the initial activation logic, the code above handles this with a synchronous check during render. For dynamic addition/removal of tabs at runtime, a `useReducer` or `useState` with a registration list is more appropriate.

---

## 3.3 Polymorphic Components (The `as` Prop Pattern)

A polymorphic component renders as different HTML elements or other React components depending on a prop, while preserving its own behavior and styling. This pattern is central to design system components. A `Button` might render as a `<button>`, an `<a>`, or a React Router `Link`, depending on context.

### The `as` Prop

The `as` prop accepts an element type (a string like `"a"` or a component reference) and renders it in place of the component's default element:

```javascript
function Box({ as: Element = "div", children, ...props }) {
  return <Element {...props}>{children}</Element>;
}

// Renders a <div>
<Box>Default div</Box>

// Renders an <a> tag
<Box as="a" href="/about">Link styled as Box</Box>

// Renders a <section> tag
<Box as="section" className="hero">Hero section</Box>
```

### A Production-Grade Polymorphic Component

A real polymorphic component must forward refs and merge styles correctly:

```javascript
import { forwardRef } from "react";

const Button = forwardRef(function Button(
  { as: Element = "button", children, className = "", variant = "primary", ...props },
  ref
) {
  const baseClass = "btn";
  const variantClass = `btn--${variant}`;
  const combinedClassName = [baseClass, variantClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Element ref={ref} className={combinedClassName} {...props}>
      {children}
    </Element>
  );
});

// As a regular button
<Button variant="primary" onClick={handleClick}>
  Submit
</Button>

// As an anchor tag
<Button as="a" href="/dashboard" variant="secondary">
  Go to Dashboard
</Button>

// As a React Router Link
import { Link } from "react-router-dom";

<Button as={Link} to="/settings" variant="ghost">
  Settings
</Button>
```

Note that in React 19, `forwardRef` is no longer necessary; refs can be received as regular props. The pattern simplifies to:

```javascript
function Button({ as: Element = "button", children, className = "", variant = "primary", ref, ...props }) {
  const combinedClassName = ["btn", `btn--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Element ref={ref} className={combinedClassName} {...props}>
      {children}
    </Element>
  );
}
```

### The `asChild` / Slot Pattern

The `asChild` pattern, popularized by Radix UI and adopted by shadcn/ui, takes a different approach. Instead of passing a component type to an `as` prop, the consumer sets `asChild={true}` and provides the target element as a child. The parent merges its own props onto the child using a `Slot` component.

```javascript
import { cloneElement, isValidElement, Children } from "react";

function Slot({ children, ...props }) {
  if (!isValidElement(children)) {
    console.warn("Slot requires a single valid React element as children");
    return null;
  }

  // Merge the Slot's props onto the child
  return cloneElement(children, {
    ...props,
    ...children.props,
    className: mergeClassNames(props.className, children.props.className),
    style: { ...props.style, ...children.props.style },
    onClick: composeHandlers(props.onClick, children.props.onClick),
  });
}

function mergeClassNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function composeHandlers(...handlers) {
  return (event) => {
    for (const handler of handlers) {
      if (typeof handler === "function") {
        handler(event);
        if (event.defaultPrevented) break;
      }
    }
  };
}
```

A component that supports `asChild` renders either its default element or the Slot:

```javascript
function Button({ asChild = false, variant = "primary", className = "", children, ...props }) {
  const combinedClassName = mergeClassNames("btn", `btn--${variant}`, className);
  const Component = asChild ? Slot : "button";

  return (
    <Component className={combinedClassName} {...props}>
      {children}
    </Component>
  );
}

// Default rendering: <button class="btn btn--primary">
<Button>Click me</Button>

// asChild rendering: <a class="btn btn--secondary" href="/home">
<Button asChild variant="secondary">
  <a href="/home">Go Home</a>
</Button>

// asChild with React Router Link
<Button asChild variant="ghost">
  <Link to="/settings">Settings</Link>
</Button>
```

### `as` vs `asChild`: When to Choose Each

| Consideration | `as` Prop | `asChild` / Slot |
|---|---|---|
| API simplicity | Simpler for common cases | Requires wrapping child in the parent |
| Prop type safety | All valid props depend on the `as` value | Child element carries its own prop types naturally |
| Prop merging | Automatic (all props go to the same element) | Explicit (Slot must merge props carefully) |
| Ecosystem adoption | Chakra UI, Mantine, older libraries | Radix UI, shadcn/ui, Ark UI, newer libraries |
| Flexibility | Limited to single element replacement | Supports any renderable child, including other compound components |

The industry trend favors `asChild` for new library development, primarily because it avoids the TypeScript performance issues associated with the `as` prop's polymorphic generics. In a pure JavaScript project, either approach works well; choose based on API ergonomics for your team.

> **Common Mistake:** When implementing `asChild` with `Slot`, forgetting to merge event handlers. If the parent `Button` attaches an `onClick` handler for analytics and the child `<a>` has its own `onClick`, a naive implementation will only keep one. Always compose event handlers by calling both in sequence, stopping propagation only if `event.defaultPrevented` is set.

---

## 3.4 Headless Components: Logic Without UI

A headless component encapsulates behavior, state management, and accessibility without rendering any visual elements. It provides the "what it does" while the consumer provides the "how it looks." This separation produces components that are maximally reusable across different design systems, styling approaches, and application contexts.

### The Headless Architecture

Headless components can be implemented as custom hooks or as renderless components. Both approaches share the same principle: logic and rendering are separate concerns.

**Hook-based headless component:**

```javascript
import { useState, useCallback, useRef, useId } from "react";

function useToggle({ defaultOpen = false, onToggle } = {}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const id = useId();
  const triggerId = `toggle-trigger-${id}`;
  const contentId = `toggle-content-${id}`;

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  }, [onToggle]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Prop getters (covered in depth in Section 3.6)
  const getTriggerProps = useCallback(
    (userProps = {}) => ({
      id: triggerId,
      "aria-expanded": isOpen,
      "aria-controls": contentId,
      onClick: composeHandlers(toggle, userProps.onClick),
      ...userProps,
    }),
    [isOpen, triggerId, contentId, toggle]
  );

  const getContentProps = useCallback(
    (userProps = {}) => ({
      id: contentId,
      role: "region",
      "aria-labelledby": triggerId,
      hidden: !isOpen,
      ...userProps,
    }),
    [isOpen, triggerId, contentId]
  );

  return {
    isOpen,
    toggle,
    open,
    close,
    getTriggerProps,
    getContentProps,
  };
}

function composeHandlers(...handlers) {
  return (event) => {
    for (const handler of handlers) {
      if (typeof handler === "function") handler(event);
    }
  };
}
```

The consumer provides all visual rendering:

```javascript
function FaqItem({ question, answer }) {
  const { isOpen, getTriggerProps, getContentProps } = useToggle();

  return (
    <div className="faq-item">
      <button {...getTriggerProps({ className: "faq-question" })}>
        {question}
        <span className={isOpen ? "icon-up" : "icon-down"} />
      </button>
      <div {...getContentProps({ className: "faq-answer" })}>
        <p>{answer}</p>
      </div>
    </div>
  );
}
```

### Headless Select: A More Complex Example

A headless Select (dropdown) demonstrates the pattern at scale, managing keyboard navigation, focus trapping, ARIA roles, and open/close state:

```javascript
import { useState, useRef, useCallback, useEffect, useId } from "react";

function useSelect({ options, defaultValue = null, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const id = useId();

  const selectedOption = options.find((opt) => opt.value === selectedValue) || null;

  const select = useCallback((value) => {
    setSelectedValue(value);
    setIsOpen(false);
    onChange?.(value);
    triggerRef.current?.focus();
  }, [onChange]);

  const handleTriggerKeyDown = useCallback((event) => {
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
        break;
      case "ArrowUp":
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(options.length - 1);
        break;
      default:
        break;
    }
  }, [options.length]);

  const handleListKeyDown = useCallback((event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev >= options.length - 1 ? 0 : prev + 1
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev <= 0 ? options.length - 1 : prev - 1
        );
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (highlightedIndex >= 0) {
          select(options[highlightedIndex].value);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  }, [options, highlightedIndex, select]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event) => {
      if (
        !listRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const getTriggerProps = useCallback(
    (userProps = {}) => ({
      ref: triggerRef,
      role: "combobox",
      "aria-expanded": isOpen,
      "aria-haspopup": "listbox",
      "aria-controls": `${id}-listbox`,
      tabIndex: 0,
      onKeyDown: composeHandlers(handleTriggerKeyDown, userProps.onKeyDown),
      onClick: composeHandlers(() => setIsOpen((prev) => !prev), userProps.onClick),
      ...userProps,
    }),
    [isOpen, id, handleTriggerKeyDown]
  );

  const getListProps = useCallback(
    (userProps = {}) => ({
      ref: listRef,
      role: "listbox",
      id: `${id}-listbox`,
      tabIndex: -1,
      onKeyDown: composeHandlers(handleListKeyDown, userProps.onKeyDown),
      ...userProps,
    }),
    [id, handleListKeyDown]
  );

  const getOptionProps = useCallback(
    (index, userProps = {}) => ({
      role: "option",
      id: `${id}-option-${index}`,
      "aria-selected": options[index].value === selectedValue,
      "data-highlighted": index === highlightedIndex,
      onClick: composeHandlers(
        () => select(options[index].value),
        userProps.onClick
      ),
      onMouseEnter: composeHandlers(
        () => setHighlightedIndex(index),
        userProps.onMouseEnter
      ),
      ...userProps,
    }),
    [id, options, selectedValue, highlightedIndex, select]
  );

  return {
    isOpen,
    selectedOption,
    selectedValue,
    highlightedIndex,
    getTriggerProps,
    getListProps,
    getOptionProps,
  };
}
```

Usage demonstrates total visual freedom:

```javascript
function CountryPicker({ countries, onSelect }) {
  const {
    isOpen,
    selectedOption,
    highlightedIndex,
    getTriggerProps,
    getListProps,
    getOptionProps,
  } = useSelect({
    options: countries,
    onChange: onSelect,
  });

  return (
    <div className="country-picker">
      <div {...getTriggerProps({ className: "picker-trigger" })}>
        {selectedOption ? (
          <span>{selectedOption.flag} {selectedOption.label}</span>
        ) : (
          <span className="placeholder">Select a country</span>
        )}
      </div>

      {isOpen && (
        <ul {...getListProps({ className: "picker-list" })}>
          {countries.map((country, index) => (
            <li
              key={country.value}
              {...getOptionProps(index, {
                className: `picker-option ${
                  index === highlightedIndex ? "highlighted" : ""
                }`,
              })}
            >
              {country.flag} {country.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Headless Libraries in the Ecosystem

Production applications rarely need to build headless components from scratch. Several mature libraries provide battle-tested implementations:

| Library | Approach | Component Count | Key Strength |
|---|---|---|---|
| Radix Primitives | Compound components with `asChild` | 28+ | Composition model, shadcn/ui ecosystem |
| React Aria (Adobe) | Hooks-first (`useButton`, `useSelect`) | 43+ | Granular ARIA control, explicit accessibility |
| Headless UI (Tailwind Labs) | Component-based with render props | ~10 | Tight Tailwind integration, small API surface |
| Ark UI | Parts-based with `asChild` | 34+ | Multi-framework (React, Vue, Solid) |
| Downshift | Hook-based (`useSelect`, `useCombobox`) | Select/Combobox only | Deep customization via state reducers |

The decision of when to build headless components from scratch versus adopting a library depends on scope. For a single custom component with unusual behavior, building from scratch is appropriate. For a design system with many interactive primitives, a headless library eliminates hundreds of hours of accessibility and keyboard navigation work.

> **Common Mistake:** Building a headless component library "for fun" or "to learn" and then shipping it to production. Custom headless components must handle edge cases that libraries have refined over years: screen reader announcements, right-to-left languages, mobile touch events, focus trapping across portals, and more. Use established libraries for production; build custom implementations for learning and for truly novel interaction patterns.

---

## 3.5 Controlled/Uncontrolled with State Reducers

The controlled/uncontrolled duality applies beyond form inputs. Any component that manages internal state can offer both modes: uncontrolled (component owns the state) and controlled (consumer owns the state). The state reducer pattern provides a middle ground, letting consumers intercept and modify state changes without fully owning the state.

### Controlled vs Uncontrolled Components

An uncontrolled component manages its own state internally. The consumer can set an initial value but cannot control ongoing state changes:

```javascript
// Uncontrolled: Disclosure manages its own open/close state
function Disclosure({ defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return children({ isOpen, toggle: () => setIsOpen((prev) => !prev) });
}

// Usage
<Disclosure defaultOpen={false}>
  {({ isOpen, toggle }) => (
    <>
      <button onClick={toggle}>{isOpen ? "Hide" : "Show"}</button>
      {isOpen && <div>Content</div>}
    </>
  )}
</Disclosure>
```

A controlled component delegates state entirely to the consumer:

```javascript
// Controlled: consumer owns the state
function Disclosure({ isOpen, onToggle, children }) {
  return children({ isOpen, toggle: onToggle });
}

// Usage
function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Disclosure isOpen={isOpen} onToggle={() => setIsOpen((prev) => !prev)}>
      {({ isOpen, toggle }) => (
        <>
          <button onClick={toggle}>{isOpen ? "Hide" : "Show"}</button>
          {isOpen && <div>Content</div>}
        </>
      )}
    </Disclosure>
  );
}
```

### Supporting Both Modes in a Single Component

The most flexible components detect whether they are controlled or uncontrolled and behave accordingly. The convention is: if a `value` prop (or equivalent) is provided, the component is controlled; if not, it is uncontrolled and uses its internal state.

```javascript
function useControllableState({ value, defaultValue, onChange }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;

  const currentValue = isControlled ? value : internalValue;

  const setValue = useCallback(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

      if (!isControlled) {
        setInternalValue(resolvedValue);
      }

      onChange?.(resolvedValue);
    },
    [isControlled, currentValue, onChange]
  );

  return [currentValue, setValue];
}
```

Usage in a toggle component:

```javascript
function Toggle({ isOn, defaultIsOn = false, onChange, children }) {
  const [on, setOn] = useControllableState({
    value: isOn,
    defaultValue: defaultIsOn,
    onChange,
  });

  return children({ on, toggle: () => setOn((prev) => !prev) });
}

// Uncontrolled usage
<Toggle defaultIsOn={false}>
  {({ on, toggle }) => <button onClick={toggle}>{on ? "ON" : "OFF"}</button>}
</Toggle>

// Controlled usage
const [isOn, setIsOn] = useState(true);
<Toggle isOn={isOn} onChange={setIsOn}>
  {({ on, toggle }) => <button onClick={toggle}>{on ? "ON" : "OFF"}</button>}
</Toggle>
```

### The State Reducer Pattern

The state reducer pattern, developed by Kent C. Dodds, provides inversion of control for internal state transitions. The consumer passes a custom reducer that can intercept, modify, or override any state change the component would normally make.

```javascript
const toggleActionTypes = {
  toggle: "TOGGLE",
  on: "ON",
  off: "OFF",
  reset: "RESET",
};

function defaultToggleReducer(state, action) {
  switch (action.type) {
    case toggleActionTypes.toggle:
      return { on: !state.on };
    case toggleActionTypes.on:
      return { on: true };
    case toggleActionTypes.off:
      return { on: false };
    case toggleActionTypes.reset:
      return { on: action.initialOn };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
}

function useToggle({
  initialOn = false,
  reducer = defaultToggleReducer,
  onChange,
} = {}) {
  const [state, dispatch] = useReducer(reducer, { on: initialOn });

  const toggle = () => {
    dispatch({ type: toggleActionTypes.toggle });
    onChange?.(!state.on);
  };

  const reset = () => dispatch({ type: toggleActionTypes.reset, initialOn });

  return {
    on: state.on,
    toggle,
    reset,
    dispatch,
  };
}

// Export the reducer and action types so consumers can extend behavior
export { useToggle, defaultToggleReducer, toggleActionTypes };
```

A consumer can now customize behavior without forking the component. For example, limiting the number of toggles:

```javascript
function App() {
  const [clickCount, setClickCount] = useState(0);
  const maxClicks = 4;
  const tooManyClicks = clickCount >= maxClicks;

  const { on, toggle, reset } = useToggle({
    reducer: (state, action) => {
      // Apply default behavior first
      const changes = defaultToggleReducer(state, action);

      // Override: prevent toggling after too many clicks
      if (action.type === toggleActionTypes.toggle && tooManyClicks) {
        return state; // no change
      }

      return changes;
    },
    onChange: () => setClickCount((c) => c + 1),
  });

  return (
    <div>
      <button onClick={toggle} disabled={tooManyClicks}>
        {on ? "ON" : "OFF"}
      </button>
      {tooManyClicks && (
        <p>
          Too many clicks!
          <button onClick={() => { reset(); setClickCount(0); }}>Reset</button>
        </p>
      )}
    </div>
  );
}
```

The key insight is that the consumer composes with the default reducer rather than replacing it entirely. The consumer calls `defaultToggleReducer(state, action)` to get the intended changes, then selectively overrides specific transitions. This is fundamentally different from full controlled mode, where the consumer must manage all state transitions.

> **See Also:** Part 3, Chapter 4, Section 4.4 for the controlled vs uncontrolled pattern applied to form inputs. The `useControllableState` hook presented here generalizes that concept.

---

## 3.6 Prop Collections and Prop Getters

When building reusable components (particularly headless ones), the consumer must apply many props to their rendered elements: ARIA attributes, event handlers, IDs, refs, and data attributes. Manually applying each prop is tedious and error-prone. Prop collections and prop getters solve this by bundling related props into a single spreadable object.

### Prop Collections

A prop collection is a plain object containing all the props a specific element needs:

```javascript
function useToggle({ initialOn = false } = {}) {
  const [on, setOn] = useState(initialOn);
  const toggle = () => setOn((prev) => !prev);

  // Prop collection: a static object of props
  const togglerProps = {
    "aria-pressed": on,
    onClick: toggle,
    role: "switch",
  };

  return { on, toggle, togglerProps };
}

// Usage
function App() {
  const { on, togglerProps } = useToggle();

  return (
    <button {...togglerProps}>
      {on ? "ON" : "OFF"}
    </button>
  );
}
```

The problem with prop collections emerges when the consumer needs to add their own handler for the same event:

```javascript
// BUG: the consumer's onClick overwrites the internal toggle handler
<button {...togglerProps} onClick={() => trackAnalytics("toggle_clicked")}>
  {on ? "ON" : "OFF"}
</button>

// BUG: spreading togglerProps after also overwrites the consumer's onClick
<button onClick={() => trackAnalytics("toggle_clicked")} {...togglerProps}>
  {on ? "ON" : "OFF"}
</button>
```

In both cases, only one `onClick` survives. Prop collections cannot compose event handlers.

### Prop Getters

Prop getters solve the composition problem by returning a function instead of a static object. The function accepts user props and returns a merged result where event handlers are composed rather than overwritten:

```javascript
function callAll(...fns) {
  return (...args) => {
    for (const fn of fns) {
      if (typeof fn === "function") fn(...args);
    }
  };
}

function useToggle({ initialOn = false, onChange } = {}) {
  const [on, setOn] = useState(initialOn);

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const getTogglerProps = useCallback(
    ({ onClick, ...userProps } = {}) => ({
      "aria-pressed": on,
      role: "switch",
      onClick: callAll(toggle, onClick),
      ...userProps,
    }),
    [on, toggle]
  );

  const getResetterProps = useCallback(
    ({ onClick, ...userProps } = {}) => ({
      onClick: callAll(() => setOn(false), onClick),
      ...userProps,
    }),
    []
  );

  return { on, toggle, getTogglerProps, getResetterProps };
}
```

Now the consumer's handler and the internal handler both execute:

```javascript
function App() {
  const { on, getTogglerProps, getResetterProps } = useToggle({
    onChange: (isOn) => console.log("Toggled:", isOn),
  });

  return (
    <div>
      <button
        {...getTogglerProps({
          onClick: () => trackAnalytics("toggle_clicked"),
          "data-testid": "main-toggle",
        })}
      >
        {on ? "ON" : "OFF"}
      </button>
      <button
        {...getResetterProps({
          onClick: () => trackAnalytics("reset_clicked"),
        })}
      >
        Reset
      </button>
    </div>
  );
}
```

### Composing Multiple Event Handlers Safely

The `callAll` utility is the standard pattern, but production implementations should also handle cases where a consumer wants to prevent the default behavior:

```javascript
function composeEventHandlers(internalHandler, externalHandler, { checkDefaultPrevented = true } = {}) {
  return (event) => {
    // Call external handler first so it can preventDefault
    externalHandler?.(event);

    // Only call internal handler if the external handler
    // did not call event.preventDefault()
    if (!checkDefaultPrevented || !event.defaultPrevented) {
      internalHandler?.(event);
    }
  };
}

// Usage in a prop getter
const getTogglerProps = ({ onClick, ...userProps } = {}) => ({
  "aria-pressed": on,
  role: "switch",
  onClick: composeEventHandlers(toggle, onClick),
  ...userProps,
});
```

This pattern gives the consumer the ability to suppress internal behavior:

```javascript
<button
  {...getTogglerProps({
    onClick: (event) => {
      if (formIsDirty) {
        event.preventDefault(); // Prevents the internal toggle
        showConfirmDialog();
      }
    },
  })}
>
  Toggle
</button>
```

> **Common Mistake:** Applying `{...userProps}` before the composed handlers in the returned object, which causes the composed `onClick` to be overwritten by the raw `onClick` from `userProps`. Always destructure known event handlers out of `userProps` before spreading, and apply composed handlers explicitly.

---

## 3.7 State Reducer Pattern (Customizable Component Behavior)

This section examines the state reducer pattern in greater depth, applying it to a real-world compound component rather than a simple toggle.

### State Reducer for a Select Component

Consider a Select component that needs customizable behavior: filtering disabled options, limiting selections in multi-select mode, or injecting analytics on every state change. The state reducer pattern enables all of these without modifying the Select's source code.

```javascript
const selectActionTypes = {
  open: "OPEN",
  close: "CLOSE",
  select: "SELECT",
  deselect: "DESELECT",
  highlight: "HIGHLIGHT",
  clearHighlight: "CLEAR_HIGHLIGHT",
  search: "SEARCH",
  clearSearch: "CLEAR_SEARCH",
};

function defaultSelectReducer(state, action) {
  switch (action.type) {
    case selectActionTypes.open:
      return { ...state, isOpen: true };

    case selectActionTypes.close:
      return { ...state, isOpen: false, highlightedIndex: -1, searchQuery: "" };

    case selectActionTypes.select:
      return {
        ...state,
        selectedValues: state.multiple
          ? [...state.selectedValues, action.value]
          : [action.value],
        isOpen: state.multiple ? state.isOpen : false,
      };

    case selectActionTypes.deselect:
      return {
        ...state,
        selectedValues: state.selectedValues.filter((v) => v !== action.value),
      };

    case selectActionTypes.highlight:
      return { ...state, highlightedIndex: action.index };

    case selectActionTypes.clearHighlight:
      return { ...state, highlightedIndex: -1 };

    case selectActionTypes.search:
      return { ...state, searchQuery: state.searchQuery + action.key };

    case selectActionTypes.clearSearch:
      return { ...state, searchQuery: "" };

    default:
      throw new Error(`Unhandled action: ${action.type}`);
  }
}

function useSelect({
  options,
  multiple = false,
  defaultValues = [],
  onChange,
  stateReducer = defaultSelectReducer,
} = {}) {
  const initialState = {
    isOpen: false,
    selectedValues: defaultValues,
    highlightedIndex: -1,
    searchQuery: "",
    multiple,
  };

  const [state, dispatch] = useReducer(stateReducer, initialState);

  const select = (value) => {
    dispatch({ type: selectActionTypes.select, value });
    onChange?.(
      multiple
        ? [...state.selectedValues, value]
        : [value]
    );
  };

  const deselect = (value) => {
    dispatch({ type: selectActionTypes.deselect, value });
    onChange?.(state.selectedValues.filter((v) => v !== value));
  };

  return {
    ...state,
    select,
    deselect,
    open: () => dispatch({ type: selectActionTypes.open }),
    close: () => dispatch({ type: selectActionTypes.close }),
    highlight: (index) =>
      dispatch({ type: selectActionTypes.highlight, index }),
  };
}

export { useSelect, defaultSelectReducer, selectActionTypes };
```

### Consumer Customization: Limiting Multi-Select

A consumer wants to limit selection to a maximum of 3 items:

```javascript
function LimitedTagPicker({ tags }) {
  const MAX_SELECTIONS = 3;

  const selectState = useSelect({
    options: tags,
    multiple: true,
    stateReducer: (state, action) => {
      const changes = defaultSelectReducer(state, action);

      // Prevent selecting more than MAX_SELECTIONS
      if (
        action.type === selectActionTypes.select &&
        state.selectedValues.length >= MAX_SELECTIONS
      ) {
        return state; // reject the change
      }

      return changes;
    },
    onChange: (values) => console.log("Selected:", values),
  });

  return (
    <div>
      <p>Selected: {selectState.selectedValues.length} / {MAX_SELECTIONS}</p>
      {tags.map((tag, i) => (
        <button
          key={tag.value}
          onClick={() =>
            selectState.selectedValues.includes(tag.value)
              ? selectState.deselect(tag.value)
              : selectState.select(tag.value)
          }
          data-selected={selectState.selectedValues.includes(tag.value)}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}
```

### Consumer Customization: Auto-Close on Selection

Another consumer wants the dropdown to close immediately after any selection, even in multi-select mode:

```javascript
const autoCloseReducer = (state, action) => {
  const changes = defaultSelectReducer(state, action);

  if (action.type === selectActionTypes.select) {
    return { ...changes, isOpen: false };
  }

  return changes;
};
```

### The Power of Exported Action Types

Exporting the action types and default reducer is essential. Without them, consumers cannot compose with the default behavior; they must rewrite the entire reducer from scratch. This would make the state reducer pattern no better than fully controlled mode.

```javascript
// Good: consumer composes with the default
stateReducer: (state, action) => {
  const changes = defaultSelectReducer(state, action);
  // modify only what is needed
  return changes;
}

// Bad: consumer reimplements everything (fragile, misses future updates)
stateReducer: (state, action) => {
  switch (action.type) {
    case "OPEN": return { ...state, isOpen: true };
    case "CLOSE": return { ...state, isOpen: false };
    // ...50 more lines duplicating internal logic
  }
}
```

> **Common Mistake:** Not exporting the default reducer and action types. This forces consumers to either accept the component's behavior entirely or fork the source code. The state reducer pattern only provides inversion of control when the consumer can compose with the default behavior. Always export `defaultReducer`, `actionTypes`, and the hook as a cohesive API surface.

---

## 3.8 Provider Pattern for Feature Flags / Configuration

Feature flags control which features are visible and active for a given user, environment, or rollout stage. The Provider pattern wraps the React tree in a Context provider that makes flag values available anywhere, enabling components to conditionally render features without prop drilling.

### Building a Feature Flag Provider

A minimal implementation requires three pieces: a Context, a Provider component, and a consumption hook.

```javascript
import { createContext, useContext, useMemo } from "react";

const FeatureFlagContext = createContext({});

function FeatureFlagProvider({ flags, children }) {
  // Memoize to prevent unnecessary re-renders of consumers
  const memoizedFlags = useMemo(() => ({ ...flags }), [flags]);

  return (
    <FeatureFlagContext.Provider value={memoizedFlags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

function useFeatureFlag(flagName) {
  const flags = useContext(FeatureFlagContext);
  return Boolean(flags[flagName]);
}

function useFeatureFlagValue(flagName) {
  const flags = useContext(FeatureFlagContext);
  return flags[flagName];
}
```

Usage at the application root:

```javascript
const featureFlags = {
  newCheckout: true,
  darkMode: false,
  betaDashboard: true,
  maxUploadSizeMB: 50,
};

function App() {
  return (
    <FeatureFlagProvider flags={featureFlags}>
      <Router />
    </FeatureFlagProvider>
  );
}
```

Usage in any component:

```javascript
function CheckoutPage() {
  const hasNewCheckout = useFeatureFlag("newCheckout");

  if (hasNewCheckout) {
    return <NewCheckoutFlow />;
  }

  return <LegacyCheckoutFlow />;
}
```

### Declarative Feature Gates

A `Feature` component provides declarative syntax for conditional rendering:

```javascript
function Feature({ name, children, fallback = null }) {
  const isEnabled = useFeatureFlag(name);
  return isEnabled ? children : fallback;
}

// Usage
<Feature name="betaDashboard" fallback={<LegacyDashboard />}>
  <BetaDashboard />
</Feature>
```

### Async Flag Loading

Production feature flag systems (LaunchDarkly, Unleash, PostHog) load flags asynchronously from a remote service. The provider must handle the loading state:

```javascript
import { createContext, useContext, useState, useEffect, useMemo } from "react";

const FeatureFlagContext = createContext({ flags: {}, isLoading: true });

function RemoteFeatureFlagProvider({ userId, children }) {
  const [flags, setFlags] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchFlags() {
      try {
        const response = await fetch(`/api/feature-flags?user=${userId}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setFlags(data.flags);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Failed to load feature flags:", error);
          // Fall back to defaults on error
          setFlags({});
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchFlags();
    return () => controller.abort();
  }, [userId]);

  const value = useMemo(() => ({ flags, isLoading }), [flags, isLoading]);

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

function useFeatureFlag(flagName, defaultValue = false) {
  const { flags, isLoading } = useContext(FeatureFlagContext);

  if (isLoading) {
    return defaultValue; // Return safe default while loading
  }

  return flagName in flags ? Boolean(flags[flagName]) : defaultValue;
}
```

### Configuration Provider: Beyond Booleans

The same pattern extends to application-wide configuration. A configuration provider distributes settings such as API base URLs, pagination limits, and theme preferences:

```javascript
const ConfigContext = createContext(null);

const defaultConfig = {
  apiBaseUrl: "https://api.example.com/v2",
  paginationLimit: 25,
  maxRetries: 3,
  enableAnalytics: true,
  supportedLocales: ["en", "es", "fr", "de"],
};

function ConfigProvider({ overrides = {}, children }) {
  const config = useMemo(
    () => ({ ...defaultConfig, ...overrides }),
    [overrides]
  );

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

function useConfig() {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return config;
}

// Usage
function ProductList() {
  const { apiBaseUrl, paginationLimit } = useConfig();

  // Use config values for data fetching
  useEffect(() => {
    fetch(`${apiBaseUrl}/products?limit=${paginationLimit}`)
      .then((res) => res.json())
      .then(setProducts);
  }, [apiBaseUrl, paginationLimit]);

  // ...
}
```

### Flag Boundaries: A Critical Best Practice

When a feature flag controls a feature, all code related to that feature must live inside the flag boundary. If the flag is off, none of the feature's code (hooks, state, API calls, side effects) should execute:

```javascript
// Wrong: hook runs even when flag is off
function Dashboard() {
  const showAnalytics = useFeatureFlag("analyticsWidget");
  const analyticsData = useAnalyticsData(); // Runs regardless of the flag

  return (
    <div>
      <MainContent />
      {showAnalytics && <AnalyticsWidget data={analyticsData} />}
    </div>
  );
}

// Correct: all feature code is inside the flag boundary
function Dashboard() {
  const showAnalytics = useFeatureFlag("analyticsWidget");

  return (
    <div>
      <MainContent />
      {showAnalytics && <AnalyticsSection />}
    </div>
  );
}

// AnalyticsSection is a separate component that encapsulates
// all analytics-related hooks and side effects
function AnalyticsSection() {
  const analyticsData = useAnalyticsData(); // Only runs when rendered
  return <AnalyticsWidget data={analyticsData} />;
}
```

> **Common Mistake:** Placing hooks above the feature flag check. Hooks run unconditionally within a component. If a hook fetches data, establishes subscriptions, or triggers side effects, it runs regardless of whether the flag is enabled. Always move flagged functionality into a child component so that hooks only execute when the feature is active.

---

## 3.9 Registry Pattern for Plugin Systems

The registry pattern enables dynamic component registration, allowing an application to be extended with new functionality without modifying its core code. This pattern follows the Open/Closed Principle: the system is open for extension but closed for modification.

### Component Registry

A component registry is a mapping from string keys to React components. External code registers components by key; the application renders them by looking up the key at runtime.

```javascript
// registry.js
const componentRegistry = new Map();

function registerComponent(key, component) {
  if (componentRegistry.has(key)) {
    console.warn(`Component "${key}" is already registered. Overwriting.`);
  }
  componentRegistry.set(key, component);
}

function getComponent(key) {
  const component = componentRegistry.get(key);
  if (!component) {
    console.warn(`Component "${key}" is not registered.`);
    return null;
  }
  return component;
}

function getRegisteredKeys() {
  return Array.from(componentRegistry.keys());
}

export { registerComponent, getComponent, getRegisteredKeys };
```

Plugins register themselves:

```javascript
// plugins/weather-widget.js
import { registerComponent } from "../registry";

function WeatherWidget({ location }) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    fetch(`/api/weather?location=${location}`)
      .then((res) => res.json())
      .then(setWeather);
  }, [location]);

  if (!weather) return <div>Loading weather...</div>;

  return (
    <div className="widget weather-widget">
      <h3>{weather.location}</h3>
      <p>{weather.temperature}° {weather.condition}</p>
    </div>
  );
}

registerComponent("weather", WeatherWidget);

// plugins/calendar-widget.js
import { registerComponent } from "../registry";

function CalendarWidget({ userId }) {
  // ... calendar implementation
  return <div className="widget calendar-widget">{/* ... */}</div>;
}

registerComponent("calendar", CalendarWidget);
```

The host application renders registered components dynamically:

```javascript
import { getComponent } from "./registry";

function DynamicWidget({ type, ...props }) {
  const Component = getComponent(type);

  if (!Component) {
    return <div className="widget-error">Unknown widget: {type}</div>;
  }

  return <Component {...props} />;
}

function Dashboard({ widgetConfig }) {
  return (
    <div className="dashboard-grid">
      {widgetConfig.map((widget) => (
        <DynamicWidget key={widget.id} type={widget.type} {...widget.props} />
      ))}
    </div>
  );
}

// Configuration drives the UI
const widgetConfig = [
  { id: "w1", type: "weather", props: { location: "San Francisco" } },
  { id: "w2", type: "calendar", props: { userId: "user-123" } },
];
```

### Zone-Based Plugin Rendering

Large applications define "zones" (also called "slots" or "extension points") where plugins can inject content. This is common in admin panels, IDEs, and dashboard frameworks.

```javascript
import { createContext, useContext, useState, useEffect, useMemo } from "react";

// Plugin metadata includes which zone it targets
const PluginContext = createContext([]);

function PluginProvider({ pluginManifest, children }) {
  const [plugins, setPlugins] = useState([]);

  useEffect(() => {
    async function loadPlugins() {
      const loaded = await Promise.allSettled(
        pluginManifest.map(async (entry) => {
          const module = await import(/* webpackIgnore: true */ entry.path);
          return {
            id: entry.id,
            zone: entry.zone,
            Component: module.default,
            meta: module.meta || {},
          };
        })
      );

      const successful = loaded
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      const failed = loaded.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        console.error(`${failed.length} plugin(s) failed to load`);
      }

      setPlugins(successful);
    }

    loadPlugins();
  }, [pluginManifest]);

  return (
    <PluginContext.Provider value={plugins}>
      {children}
    </PluginContext.Provider>
  );
}

function usePluginsByZone(zone) {
  const plugins = useContext(PluginContext);
  return useMemo(
    () => plugins.filter((plugin) => plugin.zone === zone),
    [plugins, zone]
  );
}

function PluginZone({ name, fallback = null }) {
  const zonePlugins = usePluginsByZone(name);

  if (zonePlugins.length === 0) return fallback;

  return (
    <>
      {zonePlugins.map((plugin) => (
        <PluginErrorBoundary key={plugin.id} pluginId={plugin.id}>
          <plugin.Component />
        </PluginErrorBoundary>
      ))}
    </>
  );
}
```

The host application defines zones in its layout:

```javascript
function AdminLayout() {
  return (
    <div className="admin-layout">
      <header>
        <nav>{/* main navigation */}</nav>
        <PluginZone name="header-actions" />
      </header>

      <aside className="sidebar">
        <MainNavigation />
        <PluginZone name="sidebar-bottom" />
      </aside>

      <main>
        <Outlet />
      </main>

      <footer>
        <PluginZone name="footer" fallback={<DefaultFooter />} />
      </footer>
    </div>
  );
}
```

### Error Isolation for Plugins

Each plugin should be wrapped in an error boundary so that a failing plugin does not crash the host application:

```javascript
import { Component } from "react";

class PluginErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      `Plugin "${this.props.pluginId}" crashed:`,
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="plugin-error" role="alert">
          <p>Plugin "{this.props.pluginId}" encountered an error.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Schema-Driven Dynamic Forms: A Registry in Action

One of the most practical applications of the registry pattern is schema-driven form generation, where field types map to registered components:

```javascript
const fieldRegistry = new Map();

function registerField(type, component) {
  fieldRegistry.set(type, component);
}

function getFieldComponent(type) {
  return fieldRegistry.get(type) || TextInput; // fallback to text input
}

// Register built-in fields
registerField("text", TextInput);
registerField("email", EmailInput);
registerField("select", SelectInput);
registerField("date", DatePicker);
registerField("rich-text", RichTextEditor);

// A third-party plugin registers a custom field
registerField("color-picker", ColorPickerField);

// Schema-driven form renderer
function DynamicForm({ schema, onSubmit }) {
  const [values, setValues] = useState({});

  const handleChange = (fieldName, value) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
      {schema.fields.map((field) => {
        const FieldComponent = getFieldComponent(field.type);
        return (
          <div key={field.name} className="form-field">
            <label htmlFor={field.name}>{field.label}</label>
            <FieldComponent
              id={field.name}
              name={field.name}
              value={values[field.name] || ""}
              onChange={(value) => handleChange(field.name, value)}
              {...field.props}
            />
          </div>
        );
      })}
      <button type="submit">Submit</button>
    </form>
  );
}

// Usage with a schema
const formSchema = {
  fields: [
    { name: "title", type: "text", label: "Title", props: { required: true } },
    { name: "category", type: "select", label: "Category", props: { options: categories } },
    { name: "publishDate", type: "date", label: "Publish Date" },
    { name: "themeColor", type: "color-picker", label: "Theme Color" },
    { name: "body", type: "rich-text", label: "Content" },
  ],
};

<DynamicForm schema={formSchema} onSubmit={handleSubmit} />
```

> **Common Mistake:** Over-engineering the registry pattern for applications with a small, fixed set of components. If you have fewer than five component types and they do not change at runtime, a simple object literal or switch statement is clearer and more maintainable than a registry. The registry pattern earns its complexity when components are truly dynamic: loaded from external sources, contributed by third parties, or configured by end users.

---

## 3.10 Exercise: Build a Fully Accessible, Compound Tabs Component

### Problem Statement

Build a production-quality Tabs component that satisfies the following requirements:

1. **Compound component API:** `Tabs`, `TabList`, `Tab`, `TabPanel` components that share state through Context
2. **Automatic index management:** Tabs register themselves automatically; no manual `index` prop required
3. **Full WAI-ARIA compliance:** Implements the [Tabs pattern from the WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
4. **Keyboard navigation:** Arrow keys navigate between tabs, Home/End jump to first/last tab, Space/Enter activate the focused tab
5. **Controlled and uncontrolled modes:** Works with `defaultValue` (uncontrolled) or `value` + `onChange` (controlled)
6. **Activation mode:** Supports both "automatic" (activate on focus) and "manual" (activate on Enter/Space) modes
7. **Orientation:** Supports horizontal (ArrowLeft/ArrowRight) and vertical (ArrowUp/ArrowDown) orientations

### Starter Code

Begin with this file structure:

```javascript
// tabs.js - Implement the compound components here

export { Tabs, TabList, Tab, TabPanel };

// app.js - Test your implementation
import { Tabs, TabList, Tab, TabPanel } from "./tabs";

function Demo() {
  return (
    <>
      {/* Uncontrolled, horizontal, automatic activation */}
      <Tabs defaultValue="profile">
        <TabList aria-label="User settings">
          <Tab value="profile">Profile</Tab>
          <Tab value="security">Security</Tab>
          <Tab value="notifications">Notifications</Tab>
        </TabList>
        <TabPanel value="profile">
          <h2>Profile Settings</h2>
          <p>Edit your profile information here.</p>
        </TabPanel>
        <TabPanel value="security">
          <h2>Security Settings</h2>
          <p>Manage your password and two-factor authentication.</p>
        </TabPanel>
        <TabPanel value="notifications">
          <h2>Notification Preferences</h2>
          <p>Choose what notifications you receive.</p>
        </TabPanel>
      </Tabs>

      {/* Controlled, vertical, manual activation */}
      <ControlledExample />
    </>
  );
}

function ControlledExample() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <Tabs
      value={activeTab}
      onChange={setActiveTab}
      orientation="vertical"
      activationMode="manual"
    >
      <TabList aria-label="Dashboard sections">
        <Tab value="overview">Overview</Tab>
        <Tab value="analytics">Analytics</Tab>
        <Tab value="reports">Reports</Tab>
      </TabList>
      <TabPanel value="overview">Overview content</TabPanel>
      <TabPanel value="analytics">Analytics content</TabPanel>
      <TabPanel value="reports">Reports content</TabPanel>
    </Tabs>
  );
}
```

### Solution

```javascript
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  useId,
  useEffect,
} from "react";

// --- Context ---

const TabsContext = createContext(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(
      "Tabs compound components (TabList, Tab, TabPanel) must be rendered inside <Tabs>."
    );
  }
  return context;
}

// --- useControllableState ---

function useControllableState({ value, defaultValue, onChange }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(currentValue) : next;
      if (!isControlled) {
        setInternalValue(resolved);
      }
      onChange?.(resolved);
    },
    [isControlled, currentValue, onChange]
  );

  return [currentValue, setValue];
}

// --- Tabs (Root) ---

function Tabs({
  children,
  defaultValue,
  value,
  onChange,
  orientation = "horizontal",
  activationMode = "automatic",
}) {
  const [activeValue, setActiveValue] = useControllableState({
    value,
    defaultValue,
    onChange,
  });

  // Registry: maps value -> { tabId, panelId, ref }
  const tabRegistry = useRef(new Map());

  const registerTab = useCallback((tabValue, tabId, ref) => {
    const existing = tabRegistry.current.get(tabValue) || {};
    tabRegistry.current.set(tabValue, { ...existing, tabId, ref });
    return () => tabRegistry.current.delete(tabValue);
  }, []);

  const registerPanel = useCallback((panelValue, panelId) => {
    const existing = tabRegistry.current.get(panelValue) || {};
    tabRegistry.current.set(panelValue, { ...existing, panelId });
  }, []);

  const getTabMeta = useCallback((tabValue) => {
    return tabRegistry.current.get(tabValue) || {};
  }, []);

  const getOrderedValues = useCallback(() => {
    // Maintain DOM order by reading registered tab refs
    // For simplicity, we use the order of registration
    return Array.from(tabRegistry.current.keys());
  }, []);

  const contextValue = useMemo(
    () => ({
      activeValue,
      setActiveValue,
      orientation,
      activationMode,
      registerTab,
      registerPanel,
      getTabMeta,
      getOrderedValues,
      tabRegistry,
    }),
    [
      activeValue,
      setActiveValue,
      orientation,
      activationMode,
      registerTab,
      registerPanel,
      getTabMeta,
      getOrderedValues,
    ]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div data-orientation={orientation}>{children}</div>
    </TabsContext.Provider>
  );
}

// --- TabList ---

function TabList({ children, "aria-label": ariaLabel }) {
  const { activeValue, setActiveValue, orientation, activationMode, tabRegistry } =
    useTabsContext();

  const handleKeyDown = useCallback(
    (event) => {
      const values = Array.from(tabRegistry.current.keys());
      const currentIndex = values.indexOf(activeValue);
      if (currentIndex === -1) return;

      const isHorizontal = orientation === "horizontal";
      const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

      let nextIndex = currentIndex;

      switch (event.key) {
        case nextKey:
          nextIndex = currentIndex >= values.length - 1 ? 0 : currentIndex + 1;
          break;
        case prevKey:
          nextIndex = currentIndex <= 0 ? values.length - 1 : currentIndex - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = values.length - 1;
          break;
        default:
          return; // Do not preventDefault for unhandled keys
      }

      event.preventDefault();
      const nextValue = values[nextIndex];
      const meta = tabRegistry.current.get(nextValue);

      // Focus the target tab
      meta?.ref?.current?.focus();

      // In automatic mode, activate the tab on focus
      if (activationMode === "automatic") {
        setActiveValue(nextValue);
      }
    },
    [activeValue, orientation, activationMode, setActiveValue, tabRegistry]
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

// --- Tab ---

function Tab({ value, children, disabled = false }) {
  const {
    activeValue,
    setActiveValue,
    activationMode,
    registerTab,
    getTabMeta,
  } = useTabsContext();

  const baseId = useId();
  const tabId = `tab-${baseId}`;
  const ref = useRef(null);
  const isActive = activeValue === value;

  // Register on mount
  useEffect(() => {
    const cleanup = registerTab(value, tabId, ref);
    return cleanup;
  }, [value, tabId, registerTab]);

  // Retrieve the associated panel ID for aria-controls
  const panelId = getTabMeta(value)?.panelId;

  const handleClick = () => {
    if (!disabled) {
      setActiveValue(value);
    }
  };

  const handleKeyDown = (event) => {
    // In manual activation mode, Enter or Space activates the tab
    if (activationMode === "manual" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (!disabled) {
        setActiveValue(value);
      }
    }
  };

  return (
    <button
      ref={ref}
      role="tab"
      id={tabId}
      aria-selected={isActive}
      aria-controls={panelId || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-state={isActive ? "active" : "inactive"}
      data-disabled={disabled || undefined}
    >
      {children}
    </button>
  );
}

// --- TabPanel ---

function TabPanel({ value, children }) {
  const { activeValue, registerPanel, getTabMeta } = useTabsContext();
  const baseId = useId();
  const panelId = `tabpanel-${baseId}`;
  const isActive = activeValue === value;

  // Register the panel ID so the Tab can reference it via aria-controls
  useEffect(() => {
    registerPanel(value, panelId);
  }, [value, panelId, registerPanel]);

  // Retrieve the associated tab ID for aria-labelledby
  const tabId = getTabMeta(value)?.tabId;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId || undefined}
      tabIndex={0}
      data-state={isActive ? "active" : "inactive"}
    >
      {children}
    </div>
  );
}

export { Tabs, TabList, Tab, TabPanel };
```

### Testing the Solution

Verify the implementation against the WAI-ARIA Tabs specification:

```javascript
import { useState } from "react";
import { Tabs, TabList, Tab, TabPanel } from "./tabs";

function App() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Accessible Tabs Demo</h1>

      <h2>Uncontrolled, Horizontal, Automatic Activation</h2>
      <Tabs defaultValue="profile">
        <TabList aria-label="User settings">
          <Tab value="profile">Profile</Tab>
          <Tab value="security">Security</Tab>
          <Tab value="notifications">Notifications</Tab>
          <Tab value="billing" disabled>Billing (disabled)</Tab>
        </TabList>
        <TabPanel value="profile">
          <h3>Profile Settings</h3>
          <p>Edit your name, email, and avatar.</p>
        </TabPanel>
        <TabPanel value="security">
          <h3>Security Settings</h3>
          <p>Change your password and enable two-factor auth.</p>
        </TabPanel>
        <TabPanel value="notifications">
          <h3>Notification Preferences</h3>
          <p>Choose email, push, or SMS notifications.</p>
        </TabPanel>
        <TabPanel value="billing">
          <h3>Billing</h3>
          <p>Billing section content.</p>
        </TabPanel>
      </Tabs>

      <h2>Controlled, Vertical, Manual Activation</h2>
      <ControlledVerticalTabs />
    </div>
  );
}

function ControlledVerticalTabs() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div>
      <p>Active tab: {activeTab}</p>
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        orientation="vertical"
        activationMode="manual"
      >
        <div style={{ display: "flex", gap: "1rem" }}>
          <TabList aria-label="Dashboard navigation">
            <Tab value="overview">Overview</Tab>
            <Tab value="analytics">Analytics</Tab>
            <Tab value="reports">Reports</Tab>
          </TabList>
          <div>
            <TabPanel value="overview">
              <h3>Overview</h3>
              <p>Dashboard overview content.</p>
            </TabPanel>
            <TabPanel value="analytics">
              <h3>Analytics</h3>
              <p>Charts and graphs here.</p>
            </TabPanel>
            <TabPanel value="reports">
              <h3>Reports</h3>
              <p>Downloadable reports section.</p>
            </TabPanel>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
```

### Accessibility Verification Checklist

After building the component, verify each of these behaviors:

1. **Role attributes:** `tablist` on the container, `tab` on each trigger, `tabpanel` on each content region
2. **aria-selected:** `true` on the active tab, `false` (or omitted) on others
3. **aria-controls / aria-labelledby:** Each tab references its panel; each panel references its tab
4. **Roving tabindex:** Only the active tab has `tabIndex={0}`; all others have `tabIndex={-1}`
5. **Arrow key navigation:** Left/Right for horizontal, Up/Down for vertical, with wrap-around
6. **Home/End:** Jump to first and last tab
7. **Activation modes:** Automatic activates on focus; Manual requires Enter/Space
8. **Disabled tabs:** Visually indicated, not activatable, and skipped in keyboard navigation (optional enhancement)
9. **Focus visible:** The focused tab must have a visible focus indicator (browser default or custom CSS)

**Key Takeaway:** Building an accessible compound component requires coordination between Context (for shared state), refs (for DOM focus management), ARIA attributes (for assistive technology), and keyboard event handling (for keyboard navigation). The exercise demonstrates that these concerns are not optional additions but fundamental architectural requirements. Production applications should use established headless libraries (Radix, React Aria, Headless UI) that have refined these patterns across hundreds of edge cases, and reserve custom implementations for truly novel interaction patterns.

---

## Chapter Summary

Advanced component patterns provide the architectural tools for building flexible, reusable, and accessible UI components at scale. Compound components share implicit state through Context, enabling declarative APIs that mirror native HTML semantics. Polymorphic components and the `asChild`/Slot pattern allow a single component to render as different elements while preserving its behavior. Headless components separate logic from rendering entirely, enabling maximum reuse across design systems. The state reducer pattern and prop getters provide inversion of control, letting consumers customize behavior without forking source code. The provider pattern distributes feature flags and configuration through the component tree, and the registry pattern enables plugin systems with dynamic component registration. Together, these patterns form the vocabulary of senior-level React component design.

## Further Reading

- [WAI-ARIA Authoring Practices Guide: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): the definitive specification for accessible tab implementations
- [The State Reducer Pattern with React Hooks (Kent C. Dodds)](https://kentcdodds.com/blog/the-state-reducer-pattern-with-react-hooks): the original article introducing the state reducer pattern
- [Compound Components with React Hooks (Kent C. Dodds)](https://kentcdodds.com/blog/compound-components-with-react-hooks): foundational article on Context-based compound components
- [Radix Primitives: Composition Guide](https://www.radix-ui.com/primitives/docs/guides/composition): the `asChild` pattern and Slot implementation explained by the Radix team
- [React Aria Documentation (Adobe)](https://react-spectrum.adobe.com/react-aria/): hooks-first headless component library with comprehensive ARIA support
- [Headless Component Pattern (Alyssa Holland)](https://blog.alyssaholland.me/headless-components): clear explanation of the headless architecture with practical examples
- [Advanced React Patterns Workshop (Epic React)](https://www.epicreact.dev/workshops/advanced-react-patterns): Kent C. Dodds' workshop covering state reducers, prop getters, and control props in depth
