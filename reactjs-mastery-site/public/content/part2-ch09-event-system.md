# Part 2, Chapter 9: React's Event System

## What You Will Learn

- Explain why React wraps native DOM events in SyntheticEvent objects and what cross-browser normalization this provides
- Describe how event delegation works in React 17+ (listeners on the root container, not on individual DOM nodes) and why this changed from document-level delegation
- Trace the history of event pooling, explain why it was removed in React 17, and identify legacy code patterns that relied on it
- Distinguish capture-phase from bubble-phase event handling in React using the `onEventCapture` naming convention
- Identify the passive event listener limitation for touch and wheel events and implement the native listener workaround
- Predict the interaction between React synthetic events and native DOM event listeners when both are present on the same element hierarchy

---

## 9.1 Synthetic Events: Why React Wraps Native Events

When you attach an event handler in React, the event object your handler receives is not the native browser event. It is a **SyntheticEvent**: a cross-browser wrapper that provides a consistent interface regardless of the underlying browser implementation.

```javascript
function SearchInput() {
  function handleChange(event) {
    // `event` is a SyntheticEvent, not a native InputEvent
    console.log(event.constructor.name); // "SyntheticBaseEvent"
    console.log(event.target.value);     // Works identically across browsers

    // Access the underlying native event if needed
    console.log(event.nativeEvent);      // The original InputEvent
  }

  return <input onChange={handleChange} placeholder="Search..." />;
}
```

### What SyntheticEvent Normalizes

The SyntheticEvent wrapper provides several guarantees:

**Consistent property names.** Native event property names vary across browsers and event types. React normalizes them: `event.target`, `event.currentTarget`, `event.preventDefault()`, and `event.stopPropagation()` work identically for every event type.

**Consistent behavior.** React's `onChange` for `<input>` elements fires on every keystroke, matching the behavior of the native `input` event. The native `change` event, by contrast, fires only when the field loses focus. React chose the `input` event's behavior but named it `onChange` because "change on every keystroke" is the behavior developers expect for controlled inputs.

```javascript
function ControlledInput() {
  const [value, setValue] = useState("");

  return (
    <input
      value={value}
      // React's onChange fires on every keystroke (like native "input" event),
      // NOT on blur (like native "change" event).
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
```

**Event name mapping.** React maps some event names to different native events:

| React Event | Native Event(s) |
|-------------|-----------------|
| `onChange` (for inputs) | `input`, `change` |
| `onMouseLeave` | `mouseout` (with filtering) |
| `onMouseEnter` | `mouseover` (with filtering) |
| `onFocus` | `focusin` |
| `onBlur` | `focusout` |

### The SyntheticEvent Interface

Every SyntheticEvent has these standard properties:

```javascript
function handleClick(event) {
  event.type;            // "click"
  event.target;          // The DOM element that originated the event
  event.currentTarget;   // The DOM element whose handler is executing
  event.timeStamp;       // When the event occurred
  event.nativeEvent;     // The underlying native browser event
  event.bubbles;         // Whether the event bubbles
  event.cancelable;      // Whether preventDefault() has effect
  event.defaultPrevented;// Whether preventDefault() was called
  event.eventPhase;      // 1=capture, 2=target, 3=bubble

  event.preventDefault();    // Prevent the browser's default action
  event.stopPropagation();   // Stop propagation within React's tree
  event.isPropagationStopped(); // Check if stopPropagation was called
}
```

---

## 9.2 Event Delegation: Events on the Root, Not Individual Nodes

React does not attach event listeners to each individual DOM node that has an `onClick`, `onChange`, or other handler. Instead, React attaches a single listener per event type to the **root container** (the DOM node passed to `createRoot`). This technique is called **event delegation**.

```javascript
// You write this:
function App() {
  return (
    <div onClick={() => console.log("div")}>
      <button onClick={() => console.log("button")}>
        Click
      </button>
    </div>
  );
}

// React does NOT attach listeners to the <div> or <button>.
// React attaches ONE click listener to the root container:
//   rootContainer.addEventListener("click", reactDispatcher);

// When the user clicks the button:
// 1. The native click event bubbles up to rootContainer
// 2. React's dispatcher reads event.target (the <button>)
// 3. React finds the corresponding fiber node
// 4. React walks the fiber tree upward, collecting onClick handlers
// 5. React creates a SyntheticEvent and calls handlers in order:
//    - button's onClick → logs "button"
//    - div's onClick → logs "div"
```

### Why Delegation Is Efficient

Without delegation, a list of 1,000 items would require 1,000 `addEventListener` calls (one per item). With delegation, React uses a single listener on the root regardless of how many items exist. Adding or removing items from the list requires no listener management: the single root listener automatically dispatches to whatever handlers exist in the current fiber tree.

### How React Dispatches Events

When an event reaches the root listener, React performs these steps:

1. Read `event.target` to identify the originating DOM node.
2. Find the corresponding fiber node using an internal map (`node[internalInstanceKey]`).
3. Walk the fiber tree from the target to the root, collecting capture-phase and bubble-phase handlers.
4. Create a `SyntheticEvent` wrapping the native event.
5. Execute capture-phase handlers (root to target).
6. Execute bubble-phase handlers (target to root).
7. If `event.stopPropagation()` was called, stop the traversal early.

> **See Also:** Part 2, Chapter 4, Section 4.3 for the fiber tree structure (child, sibling, return pointers) that React traverses during event dispatch.

---

## 9.3 Event Pooling (Removed in React 17, but Why It Existed)

In React 16 and earlier, React reused SyntheticEvent objects through a mechanism called **event pooling**. After an event handler completed, React nullified all properties on the SyntheticEvent object and returned it to an internal pool for reuse by future events.

```javascript
// React 16 behavior (no longer applies in React 17+)
function LegacyHandler() {
  function handleClick(event) {
    console.log(event.type); // "click" (works)

    setTimeout(() => {
      console.log(event.type); // null! Properties were nullified
    }, 100);
  }

  return <button onClick={handleClick}>Click</button>;
}
```

### Why Pooling Existed

The rationale was performance optimization. In high-frequency event scenarios (mouse movement, scrolling), creating a new object for every event and letting the garbage collector reclaim it could theoretically cause GC pauses. Pooling aimed to eliminate this allocation pressure by reusing objects.

### Why Pooling Was Removed

The React team determined that event pooling did not improve performance in modern JavaScript engines. Modern engines (V8, SpiderMonkey, JavaScriptCore) handle short-lived object allocation efficiently through generational garbage collection. The overhead of nullifying properties and managing the pool was a net negative.

More importantly, pooling was a constant source of developer confusion and bugs. The most common pattern that broke was accessing event properties in asynchronous callbacks:

```javascript
// React 16: this pattern required event.persist()
function LegacyAsyncHandler() {
  function handleChange(event) {
    // event.persist(); ← Required in React 16 to prevent nullification

    fetchSuggestions(event.target.value).then((suggestions) => {
      // In React 16 without persist(): event.target is null here
      // In React 17+: event.target works correctly
      setSuggestions(suggestions);
    });
  }

  return <input onChange={handleChange} />;
}
```

In React 17+, SyntheticEvent objects are no longer pooled. They persist for the full lifetime of the handler execution, including asynchronous continuations. The `event.persist()` method still exists as a no-op for backward compatibility.

> **Common Mistake:** Developers working with legacy React 16 codebases sometimes encounter pooling-related bugs when upgrading. If you see `event.persist()` calls in a codebase running React 17+, they are harmless no-ops and can be safely removed during cleanup. However, the underlying pattern (accessing event properties asynchronously) is now safe without any workaround.

---

## 9.4 How React 17+ Changed Event Delegation

React 17 made a significant change to where event listeners are attached. This change had no effect on the developer-facing API (your `onClick` handlers work identically) but changed the internal architecture.

### React 16: Listeners on `document`

```javascript
// React 16 internal behavior (simplified):
document.addEventListener("click", reactClickDispatcher);
document.addEventListener("change", reactChangeDispatcher);
// etc., one listener per event type on document
```

### React 17+: Listeners on the Root Container

```javascript
// React 17+ internal behavior (simplified):
const root = document.getElementById("root");
root.addEventListener("click", reactClickDispatcher);
root.addEventListener("change", reactChangeDispatcher);
// etc., one listener per event type on the root container
```

### Why This Change Was Made

**Multiple React trees on one page.** When two React applications (potentially different versions) both attach to `document`, their event systems interfere. Calling `event.stopPropagation()` in one React tree would prevent `document`-level handlers from firing, silencing the other React tree's events. With root-level delegation, each tree's events are isolated.

**Micro-frontend compatibility.** In micro-frontend architectures, multiple independently deployed applications share the same page. Root-level delegation ensures each application manages only its own events, with clear boundaries.

**Interop with non-React code.** Native event listeners on `document` (added by analytics libraries, jQuery plugins, or framework-agnostic code) would fire before React's handlers in React 16, because native listeners were registered first. In React 17+, the relationship is more predictable: events bubble through the React root first, then continue to `document`.

### The `onScroll` Change

React 17 also changed `onScroll` to no longer bubble, matching native browser behavior. In React 16, a scroll event on a nested `<div>` would trigger `onScroll` handlers on ancestor elements. In React 17+, scroll events fire only on the element that scrolled.

```javascript
function ScrollableLayout() {
  return (
    <div
      onScroll={() => console.log("outer")}
      style={{ height: 300, overflow: "auto" }}
    >
      <div
        onScroll={() => console.log("inner")}
        style={{ height: 200, overflow: "auto" }}
      >
        <div style={{ height: 500 }}>Tall content</div>
      </div>
    </div>
  );
}

// React 16: scrolling the inner div logs "inner" then "outer"
// React 17+: scrolling the inner div logs only "inner"
```

---

## 9.5 Capture vs Bubble Phase in React

The DOM event model defines two propagation phases:

1. **Capture phase**: The event travels from the window down to the target element.
2. **Bubble phase**: The event travels from the target element back up to the window.

React simulates both phases within its fiber tree traversal. Standard event props (`onClick`, `onChange`, `onFocus`) register bubble-phase handlers. Appending `Capture` to any event name registers a capture-phase handler.

```javascript
function EventPhaseDemo() {
  return (
    <div
      onClickCapture={() => console.log("1. div capture")}
      onClick={() => console.log("4. div bubble")}
    >
      <button
        onClickCapture={() => console.log("2. button capture")}
        onClick={() => console.log("3. button bubble")}
      >
        Click Me
      </button>
    </div>
  );
}

// Clicking the button logs:
// "1. div capture"     (capture phase: root → target)
// "2. button capture"
// "3. button bubble"   (bubble phase: target → root)
// "4. div bubble"
```

### Practical Use Cases for Capture

**Global event interception.** Capture-phase handlers fire before any child bubble-phase handlers, making them useful for logging, analytics, or access-control checks that must execute regardless of whether a child calls `stopPropagation()`:

```javascript
function AnalyticsWrapper({ children }) {
  function trackClick(event) {
    // Fires before any child onClick handler, guaranteed.
    // Even if a child calls stopPropagation(), this still runs.
    analytics.track("click", {
      target: event.target.tagName,
      timestamp: event.timeStamp,
    });
  }

  return <div onClickCapture={trackClick}>{children}</div>;
}
```

**Focus management.** Capture-phase focus handlers can intercept focus before it reaches a child element, useful for focus trapping in modal dialogs:

```javascript
function FocusTrap({ children }) {
  const containerRef = useRef(null);

  function handleFocusCapture(event) {
    const container = containerRef.current;
    if (!container.contains(event.target)) {
      // Focus is leaving the container; redirect it back
      event.stopPropagation();
      container.querySelector("[tabindex]")?.focus();
    }
  }

  return (
    <div ref={containerRef} onFocusCapture={handleFocusCapture}>
      {children}
    </div>
  );
}
```

### stopPropagation Behavior

`event.stopPropagation()` in React stops propagation within React's simulated event dispatch. It does not affect native event propagation (which has already occurred by the time React's root listener fires).

```javascript
function PropagationDemo() {
  return (
    <div onClick={() => console.log("parent")}>
      <button
        onClick={(e) => {
          e.stopPropagation(); // Stops React's simulated bubbling
          console.log("child");
        }}
      >
        Click
      </button>
    </div>
  );
}

// Clicking the button logs only "child".
// "parent" does NOT log because stopPropagation
// prevented React's bubble-phase dispatch from reaching the div.
```

---

## 9.6 Passive Events and Performance

Modern browsers support **passive event listeners**: listeners that promise not to call `event.preventDefault()`. This hint allows the browser to begin scrolling or touch-handling immediately without waiting for the event handler to complete, significantly improving scroll performance.

### React's Passive Event Defaults

React 17+ registers `onTouchStart`, `onTouchMove`, and `onWheel` handlers as **passive** by default. This means calling `event.preventDefault()` inside these handlers has no effect; the browser ignores it and logs a warning.

```javascript
function ScrollBlocker() {
  function handleWheel(event) {
    // This does NOT work! React registers wheel listeners as passive.
    event.preventDefault(); // Browser warning: ignored, passive listener
    console.log("Wheel blocked"); // Handler runs, but scroll is not prevented
  }

  return (
    <div onWheel={handleWheel} style={{ height: 200, overflow: "auto" }}>
      <div style={{ height: 800 }}>Scrollable content</div>
    </div>
  );
}
```

### The Workaround: Native Event Listeners

To prevent default behavior on touch or wheel events, bypass React's event system and attach a native listener with `{ passive: false }`:

```javascript
function PreventableScroll({ children }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const element = containerRef.current;

    function handleWheel(event) {
      // Now preventDefault() works because the listener is non-passive
      if (shouldPreventScroll(event)) {
        event.preventDefault();
      }
    }

    // Attach native listener with passive: false
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div ref={containerRef} style={{ height: 200, overflow: "auto" }}>
      {children}
    </div>
  );
}
```

> **Common Mistake:** Developers often struggle with scroll-prevention in React, not realizing that React's wheel and touch handlers are passive. They add `onWheel={(e) => e.preventDefault()}` and are surprised when scrolling continues. The solution requires stepping outside React's event system with a native `addEventListener` call using `{ passive: false }`. As of React 19.2, there is no built-in mechanism to mark React event handlers as non-passive.

### Why React Chose Passive Defaults

The decision was deliberate. Scroll jank is one of the most common performance complaints on the web. When wheel and touch event listeners are non-passive, the browser must wait for the handler to complete before it knows whether to scroll, introducing visible delay. By defaulting to passive, React ensures smooth scrolling for the vast majority of use cases. The minority of cases that need `preventDefault()` can use the native listener workaround.

---

## 9.7 Exercise: Compare React Event Behavior vs Native DOM Events

### Problem Statement

Build a component that demonstrates the behavioral differences between React synthetic events and native DOM events. The exercise covers: event delegation timing, `stopPropagation` interaction, `currentTarget` persistence, and the `onChange` vs native `input`/`change` distinction.

### Solution

```javascript
import { useState, useEffect, useRef } from "react";

function EventComparisonLab() {
  const [log, setLog] = useState([]);
  const outerRef = useRef(null);
  const innerRef = useRef(null);

  const addLog = (msg) => {
    setLog((prev) => [...prev, msg]);
  };

  // Part 1: Native listeners (added via ref + useEffect)
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;

    // Native listeners fire in DOM order (attached directly to nodes)
    const outerNativeHandler = () => addLog("Native: outer div (bubble)");
    const innerNativeHandler = () => addLog("Native: inner button (bubble)");

    outer.addEventListener("click", outerNativeHandler);
    inner.addEventListener("click", innerNativeHandler);

    return () => {
      outer.removeEventListener("click", outerNativeHandler);
      inner.removeEventListener("click", innerNativeHandler);
    };
  }, []);

  return (
    <div>
      <h2>Event Comparison Lab</h2>

      {/* Part 1: Click delegation timing */}
      <section>
        <h3>Test 1: Native vs React Event Order</h3>
        <div
          ref={outerRef}
          onClick={() => addLog("React: outer div (bubble)")}
          style={{ padding: 20, border: "2px solid blue" }}
        >
          <button
            ref={innerRef}
            onClick={() => addLog("React: inner button (bubble)")}
          >
            Click to test order
          </button>
        </div>
        <p>
          Expected order: Native inner, Native outer, React inner, React outer.
          Native listeners fire first because they are attached directly to
          the DOM nodes. React's listener is on the root container, so the
          event reaches it after bubbling through all native listeners.
        </p>
      </section>

      {/* Part 2: stopPropagation interaction */}
      <section>
        <h3>Test 2: React stopPropagation</h3>
        <div
          onClick={() => addLog("React parent: received click")}
          style={{ padding: 20, border: "2px solid green" }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              addLog("React child: stopped propagation");
            }}
          >
            Click (stops React propagation)
          </button>
        </div>
        <p>
          Expected: Only "React child: stopped propagation" logs.
          React's parent handler does not fire because stopPropagation
          stopped React's simulated bubble. However, any native listener
          on the parent div WOULD still fire (the native event already
          bubbled past it before reaching React's root listener).
        </p>
      </section>

      {/* Part 3: onChange vs native input/change */}
      <section>
        <h3>Test 3: React onChange vs Native Events</h3>
        <InputComparison onLog={addLog} />
      </section>

      {/* Log display */}
      <div
        style={{
          marginTop: 20,
          padding: 12,
          backgroundColor: "#f5f5f5",
          borderRadius: 8,
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>Event Log:</strong>
          <button onClick={() => setLog([])}>Clear</button>
        </div>
        <ol>
          {log.map((entry, i) => (
            <li key={i} style={{ fontFamily: "monospace", fontSize: 13 }}>
              {entry}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function InputComparison({ onLog }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;

    // Native "input" event: fires on every keystroke
    const handleNativeInput = (e) => {
      onLog(`Native "input" event: value="${e.target.value}"`);
    };

    // Native "change" event: fires only on blur
    const handleNativeChange = (e) => {
      onLog(`Native "change" event: value="${e.target.value}"`);
    };

    el.addEventListener("input", handleNativeInput);
    el.addEventListener("change", handleNativeChange);

    return () => {
      el.removeEventListener("input", handleNativeInput);
      el.removeEventListener("change", handleNativeChange);
    };
  }, [onLog]);

  return (
    <div>
      <input
        ref={inputRef}
        // React's onChange fires on every keystroke (like native "input")
        onChange={(e) => {
          onLog(`React onChange: value="${e.target.value}"`);
        }}
        placeholder="Type and then blur..."
      />
      <p>
        Type a character, then click outside the input. Expected: on each
        keystroke, both "Native input" and "React onChange" fire. On blur,
        "Native change" fires. React does not have a separate "onInput" that
        behaves differently from "onChange" for text inputs.
      </p>
    </div>
  );
}
```

### Expected Output When Clicking Test 1's Button

```
Native: inner button (bubble)
Native: outer div (bubble)
React: inner button (bubble)
React: outer div (bubble)
```

### Explanation

1. **Native listeners fire first.** The click event originates on the button and bubbles through the DOM. The native listener on the button fires first, then the native listener on the outer div. Only after the event finishes bubbling through all DOM nodes does it reach React's single listener on the root container.

2. **React listeners fire second.** React's root listener receives the event, identifies the target fiber, and simulates its own bubble phase: button handler first, then div handler.

This ordering means that `stopPropagation()` in a native listener on the button would prevent the event from reaching React's root listener entirely, silencing all React handlers. Conversely, `stopPropagation()` in a React handler has no effect on native listeners (they have already fired).

### Key Takeaway

React's event system is a complete abstraction layer on top of the native DOM event model. Understanding the abstraction boundary (one listener on the root, simulated propagation via fiber traversal, SyntheticEvent wrapper, passive defaults for scroll events) allows developers to predict behavior in edge cases where React and native code interact. The most important practical rules are: avoid mixing React and native listeners for the same event type on overlapping elements; use native listeners with `{ passive: false }` when you need to prevent scroll/touch default behavior; and remember that native listeners always fire before React handlers for the same event.

---

## Chapter Summary

React's event system uses SyntheticEvent wrappers that normalize cross-browser differences and a delegation model where a single listener per event type is attached to the root container (changed from `document` in React 17 for micro-frontend and multi-root compatibility). Event pooling was removed in React 17 because modern engines handle short-lived objects efficiently. React simulates both capture and bubble phases within its fiber tree; capture handlers use the `onEventCapture` naming convention. Touch and wheel listeners are registered as passive by default for scroll performance, requiring native `addEventListener` with `{ passive: false }` to call `preventDefault()`. Native event listeners always fire before React's delegated handlers, and `stopPropagation()` in each system does not cross the boundary into the other.

## Further Reading

- [React v17.0 Release Candidate: No New Features (React Blog)](https://legacy.reactjs.org/blog/2020/08/10/react-v17-rc.html) — the official explanation of the delegation change and scroll event normalization
- [SyntheticEvent (React Legacy Documentation)](https://legacy.reactjs.org/docs/events.html) — complete reference for all supported React events
- [Event Propagation: React Synthetic Events vs Native Events (Gideon Pyzer)](https://gideonpyzer.dev/blog/2018/12/29/event-propagation-react-synthetic-events-vs-native-events/) — detailed analysis of how React and native events interact
- [Don't Mix React Synthetic Events with Native DOM Events (Ryan Kubik)](https://ryankubik.com/blog/dont-mix-react-synthetic-and-native-events) — practical guide to avoiding cross-system conflicts
- [Support Passive Event Listeners (React Issue #6436)](https://github.com/facebook/react/issues/6436) — the ongoing discussion about passive events in React
- [Under the Hood of Event Listeners in React (DEV Community)](https://dev.to/romaintrotard/under-the-hood-of-event-listeners-in-react-4g01) — technical walkthrough of React's internal event dispatch
