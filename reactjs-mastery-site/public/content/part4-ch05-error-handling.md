# Part 4, Chapter 5: Error Handling Architecture

## What You Will Learn

- Implement class-based error boundaries and explain why React requires this specific component pattern for catching render errors
- Design a granular error boundary strategy that isolates failures at the app, route, feature, and widget levels
- Build fallback UI components that communicate errors clearly and offer recovery paths to users
- Wire up retry and reset mechanisms using both manual triggers and automatic `resetKeys`
- Handle async errors in `useEffect`, event handlers, and transitions that error boundaries cannot catch natively
- Integrate a global error tracking service (Sentry, LogRocket) with React's error reporting APIs, including the React 19 `onCaughtError`, `onUncaughtError`, and `onRecoverableError` callbacks
- Distinguish between graceful degradation and hard failure strategies, and choose the right approach for each scenario

---

## 5.1 Error Boundaries: The React Way to Catch Errors

In traditional JavaScript, a `try/catch` block wraps synchronous code and intercepts thrown exceptions before they propagate further. React's rendering model, however, is declarative: you describe what the UI should look like, and React calls your component functions internally during the render phase. Because React controls when and how components render, a standard `try/catch` placed around a JSX expression or a parent component's return statement cannot intercept an error thrown inside a child component's render method. The call stack at the point of the throw passes through React's internal reconciler, not through your application code.

React introduced error boundaries in version 16 to solve this problem. An error boundary is a React component that catches JavaScript errors anywhere in its child component tree during rendering, in lifecycle methods, and in constructors. When an error is caught, the boundary renders a fallback UI instead of the crashed component tree.

### The Class Component Requirement

Error boundaries must be class components. As of React 19, there is no hook-based equivalent for `componentDidCatch` or `static getDerivedStateFromError`. The reason is architectural: these lifecycle methods need to intercept errors during the render phase itself, which is managed by React's internal reconciler. Hooks run inside function components, which are called by the reconciler; error boundaries must wrap around that calling mechanism.

```javascript
import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI.
    // This method runs during the render phase, so side effects
    // are not permitted here.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // This method runs during the commit phase.
    // Use it for side effects such as logging to an error
    // tracking service.
    console.error('Error caught by boundary:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI. The `fallback` prop allows
      // the parent to customize what appears when an error occurs.
      return this.props.fallback || <h2>Something went wrong.</h2>;
    }

    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <ErrorBoundary fallback={<p>The application encountered an error.</p>}>
      <Dashboard />
    </ErrorBoundary>
  );
}
```

### What Error Boundaries Catch (and Do Not Catch)

Error boundaries catch errors in three specific contexts:

1. **During rendering** (when React calls your component function or class `render` method)
2. **In lifecycle methods** (`componentDidMount`, `componentDidUpdate`, etc.)
3. **In constructors** of child components

Error boundaries do **not** catch errors in:

- Event handlers (e.g., `onClick`, `onChange`)
- Asynchronous code (e.g., `setTimeout`, `fetch` callbacks, `async/await` in `useEffect`)
- Server-side rendering
- Errors thrown in the error boundary itself (rather than its children)

This distinction is critical. An error thrown inside an `onClick` handler will not trigger any error boundary. Section 5.5 covers strategies for handling these cases.

> **Common Mistake:** Wrapping event handler logic in an error boundary and expecting it to catch errors thrown in `onClick` or `onSubmit` callbacks. Error boundaries only intercept errors during React's render and commit phases. Event handlers execute outside of React's rendering pipeline; use `try/catch` within the handler, or use the `showBoundary` pattern from `react-error-boundary` to manually propagate the error.

### React 19 Root-Level Error Callbacks

React 19 introduced three callback options on `createRoot` and `hydrateRoot` that provide centralized error processing at the application root:

```javascript
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root'), {
  // Called when an error IS caught by an error boundary
  onCaughtError(error, errorInfo) {
    logToErrorService('caught', error, errorInfo.componentStack);
  },

  // Called when an error is NOT caught by any error boundary
  onUncaughtError(error, errorInfo) {
    logToErrorService('uncaught', error, errorInfo.componentStack);
  },

  // Called when React automatically recovers from an error
  // (e.g., during hydration mismatch recovery)
  onRecoverableError(error, errorInfo) {
    logToErrorService('recoverable', error, errorInfo.componentStack);
  },
});

root.render(<App />);
```

These callbacks complement error boundaries rather than replacing them. `onCaughtError` fires whenever any error boundary in the tree catches an error, making it a single point for centralized logging without requiring each boundary to implement its own reporting logic. `onUncaughtError` acts as a last resort for errors that escape all boundaries.

> **See Also:** Part 2, Chapter 5, Section 5.7 for how side effects in the commit phase relate to error boundary behavior.

---

## 5.2 Granular Error Boundaries (Per-Feature, Per-Route, Per-Widget)

A single top-level error boundary is a starting point, but it creates a poor user experience: any error in any part of the application replaces the entire UI with a fallback screen. A senior-level architecture isolates failures so that a broken widget does not take down the entire page.

### The Layered Boundary Strategy

Error boundaries should be placed at multiple levels, each with a different scope and fallback style:

```
App-Level Boundary
  ├── Route-Level Boundary (per page)
  │     ├── Layout Section Boundary (sidebar, main content, header)
  │     │     ├── Feature/Widget Boundary (chart, comments, feed)
  │     │     └── Feature/Widget Boundary
  │     └── Layout Section Boundary
  └── Route-Level Boundary
```

**Level 1: App-level boundary.** This is the outermost safety net. Its fallback should display a full-page error screen with a button to reload the application. This boundary should catch only the errors that escape every other boundary.

**Level 2: Route-level boundary.** Wrap each route (page) in its own boundary. If the settings page crashes, the user can still navigate to other pages. The navigation bar, which lives outside the route boundary, remains functional.

**Level 3: Layout-level boundary.** Within a page, wrap independent layout sections. A three-column layout (sidebar, main content, detail panel) should have each column wrapped separately. This mirrors Facebook's Messenger architecture, where the conversation list, message thread, and info panel each have independent boundaries.

**Level 4: Feature/widget-level boundary.** Wrap components that are known to be unstable, depend on external data, or render third-party content. A charting component that processes complex data, a comments section fetching from an API, or an embedded third-party widget are all candidates.

### Implementation

```javascript
import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          reset: () => this.setState({ hasError: false, error: null }),
        });
      }
      return this.props.fallback || <p>Something went wrong.</p>;
    }
    return this.props.children;
  }
}

// App-level: full-page fallback
function App() {
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Application Error</h1>
          <p>An unexpected error occurred. Please try reloading.</p>
          <button onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      )}
    >
      <Header />
      <main>
        <AppRouter />
      </main>
    </ErrorBoundary>
  );
}

// Route-level: page-specific fallback
function SettingsPage() {
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <div>
          <p>Failed to load settings.</p>
          <button onClick={reset}>Try Again</button>
        </div>
      )}
    >
      <SettingsForm />
      <NotificationPreferences />
    </ErrorBoundary>
  );
}

// Widget-level: minimal inline fallback
function DashboardPage() {
  return (
    <div className="dashboard-grid">
      <ErrorBoundary fallback={<p>Chart unavailable.</p>}>
        <RevenueChart />
      </ErrorBoundary>

      <ErrorBoundary fallback={<p>Activity feed unavailable.</p>}>
        <ActivityFeed />
      </ErrorBoundary>

      <ErrorBoundary fallback={<p>Stats unavailable.</p>}>
        <QuickStats />
      </ErrorBoundary>
    </div>
  );
}
```

### Placement Heuristics

Use these guidelines to decide where to place boundaries:

1. **Wrap independent sections.** If a section can fail without affecting adjacent sections, it should have its own boundary.
2. **Wrap external data dependencies.** Components that fetch from APIs or render user-generated content are more likely to encounter unexpected data shapes.
3. **Wrap third-party components.** Libraries you do not control may throw errors you cannot predict.
4. **Do not wrap every component.** Wrapping every single component adds boilerplate and cognitive overhead. Focus on logical fault isolation zones, not individual components.

> **Common Mistake:** Placing a single error boundary at the app root and considering error handling "done." This means any error, no matter how minor or localized, replaces the entire application with a fallback screen. Users lose all context and in-progress work. Layer your boundaries to match the granularity of your UI.

---

## 5.3 Fallback UI Design Patterns

The fallback UI that replaces a crashed component is a critical part of the user experience. A generic "Something went wrong" message provides no value to the user and no actionable information. Effective fallback UI follows several principles.

### Principle 1: Match the Scope

The fallback should visually match the scope of what it replaces. A widget-level fallback should be a small, inline element that fits within the layout. A page-level fallback should fill the content area. An app-level fallback should be a full-screen message.

```javascript
// Widget-level: subtle, inline
function WidgetFallback({ error, reset }) {
  return (
    <div className="widget-error" role="alert">
      <span className="widget-error-icon" aria-hidden="true">!</span>
      <span>Unable to load this section.</span>
      <button onClick={reset} className="widget-error-retry">
        Retry
      </button>
    </div>
  );
}

// Page-level: fills content area, preserves navigation
function PageFallback({ error, reset }) {
  return (
    <div className="page-error" role="alert">
      <h2>This page could not be loaded</h2>
      <p>
        An error occurred while rendering this page. You can try
        again or navigate to a different section.
      </p>
      <div className="page-error-actions">
        <button onClick={reset}>Try Again</button>
        <a href="/">Go to Home</a>
      </div>
    </div>
  );
}

// App-level: full-screen, only option is reload
function AppFallback() {
  return (
    <div className="app-error" role="alert">
      <h1>Something went wrong</h1>
      <p>
        The application encountered an unexpected error.
        Please reload the page.
      </p>
      <button onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
```

### Principle 2: Provide Actionable Options

Every fallback should give the user at least one action: retry, navigate away, reload, or contact support. The specific actions depend on the error type and the boundary scope.

### Principle 3: Preserve Context

When possible, the fallback should preserve surrounding UI so the user does not lose orientation. If a sidebar widget crashes, the rest of the page should remain intact. The user should be able to continue their work or navigate to another section.

### Principle 4: Communicate Without Jargon

Fallback messages should be written in plain language. Avoid exposing stack traces, error codes, or technical details to end users. A "details" toggle can optionally reveal technical information for users who need it, but it should be collapsed by default.

```javascript
function DetailedFallback({ error, reset }) {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div className="error-fallback" role="alert">
      <h3>Something went wrong</h3>
      <p>This section failed to load. Please try again.</p>

      <div className="error-actions">
        <button onClick={reset}>Try Again</button>
        <button onClick={() => setShowDetails(prev => !prev)}>
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {showDetails && (
        <pre className="error-details">
          {error.message}
        </pre>
      )}
    </div>
  );
}
```

### Principle 5: Accessibility

Fallback UI must be accessible. Use `role="alert"` so screen readers announce the error. Ensure buttons are focusable and labeled. Maintain sufficient color contrast for error messages.

---

## 5.4 Error Recovery: Retry Mechanisms

Catching an error is only half the problem. Recovering from it is the other half. React error boundaries latch: once they catch an error, they remain in the error state until explicitly reset. Recovery requires clearing the error state and re-rendering the children.

### Manual Reset via State

The simplest recovery mechanism is a reset function that clears the boundary's error state:

```javascript
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  reset() {
    // Invoke the onReset callback before clearing the error.
    // This allows the parent to perform cleanup such as
    // invalidating a cache or resetting dependent state.
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          reset: this.reset,
        });
      }
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

When the user clicks "Try Again," the boundary clears its error state and re-renders its children. If the underlying cause of the error has not been resolved (for example, a component that always throws on render), the boundary will immediately catch the same error again.

### Automatic Reset via Reset Keys

A more sophisticated pattern is automatic reset triggered by external state changes. The boundary watches a set of "reset keys" and clears its error state whenever any key changes:

```javascript
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps) {
    // If the boundary is in an error state and the reset keys
    // have changed, automatically clear the error.
    if (this.state.hasError && this.props.resetKeys) {
      const hasResetKeyChanged = this.props.resetKeys.some(
        (key, index) => key !== (prevProps.resetKeys || [])[index]
      );
      if (hasResetKeyChanged) {
        if (this.props.onReset) {
          this.props.onReset();
        }
        this.setState({ hasError: false, error: null });
      }
    }
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          reset: () => {
            if (this.props.onReset) this.props.onReset();
            this.setState({ hasError: false, error: null });
          },
        });
      }
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Usage: boundary resets automatically when the route changes
function AppRouter() {
  const location = useLocation();

  return (
    <ErrorBoundary
      resetKeys={[location.pathname]}
      fallback={({ error, reset }) => (
        <PageFallback error={error} reset={reset} />
      )}
    >
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </ErrorBoundary>
  );
}
```

This pattern is particularly useful for route-level boundaries. When the user navigates away from a crashed page and then back, the boundary automatically resets because the `pathname` reset key changed.

### Using the `react-error-boundary` Library

The `react-error-boundary` library by Brian Vaughn (a former member of the React core team) encapsulates these patterns in a production-ready package. It provides function-component-friendly APIs, built-in reset mechanisms, and an imperative `showBoundary` function for propagating errors from event handlers:

```javascript
import {
  ErrorBoundary,
  useErrorBoundary,
} from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try Again</button>
    </div>
  );
}

function Dashboard() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Clear any cached data that may have caused the error
      }}
      resetKeys={[/* values that trigger auto-reset */]}
    >
      <DashboardContent />
    </ErrorBoundary>
  );
}

// Using showBoundary to propagate event handler errors
function DeleteButton({ itemId }) {
  const { showBoundary } = useErrorBoundary();

  async function handleDelete() {
    try {
      await deleteItem(itemId);
    } catch (error) {
      // Propagate the error to the nearest error boundary
      showBoundary(error);
    }
  }

  return <button onClick={handleDelete}>Delete</button>;
}
```

### Retry with Backoff

For errors caused by transient network failures, combine the reset mechanism with a retry strategy. Rather than immediately re-rendering (which may hit the same failure), introduce a delay:

```javascript
function RetryableFallback({ error, reset }) {
  const [retryCount, setRetryCount] = React.useState(0);
  const [retrying, setRetrying] = React.useState(false);
  const maxRetries = 3;

  function handleRetry() {
    if (retryCount >= maxRetries) return;

    setRetrying(true);
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);

    setTimeout(() => {
      setRetryCount(prev => prev + 1);
      setRetrying(false);
      reset();
    }, delay);
  }

  return (
    <div role="alert">
      <p>Failed to load this section.</p>
      {retryCount < maxRetries ? (
        <button onClick={handleRetry} disabled={retrying}>
          {retrying ? 'Retrying...' : `Retry (${retryCount}/${maxRetries})`}
        </button>
      ) : (
        <p>Maximum retries reached. Please reload the page.</p>
      )}
    </div>
  );
}
```

> **See Also:** Part 1, Chapter 11, Section 11.7 for the implementation of a retry mechanism with exponential backoff.

---

## 5.5 Async Error Handling in React (Errors in useEffect, Event Handlers)

Error boundaries catch errors thrown synchronously during rendering. Many real-world errors, however, occur asynchronously: a failed API call in `useEffect`, an exception in an `onClick` handler, or a rejected promise in a data mutation. These errors require different handling strategies.

### Errors in Event Handlers

Event handlers execute outside of React's render phase. When an exception is thrown inside an `onClick` callback, it propagates up through the browser's native event dispatch mechanism, not through React's component tree. No error boundary will intercept it.

**Strategy 1: Local try/catch**

The simplest approach is wrapping the event handler's body in a `try/catch` and handling the error locally:

```javascript
function SubmitForm({ onSubmit }) {
  const [error, setError] = React.useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(new FormData(event.target));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {/* form fields */}
      <button type="submit">Submit</button>
    </form>
  );
}
```

**Strategy 2: Propagate to the nearest error boundary**

When you want event handler errors to be caught by an error boundary (for example, to trigger a fallback UI for an entire section), use the `showBoundary` pattern from `react-error-boundary`:

```javascript
import { useErrorBoundary } from 'react-error-boundary';

function DataExporter({ data }) {
  const { showBoundary } = useErrorBoundary();

  async function handleExport() {
    try {
      await exportToCSV(data);
    } catch (error) {
      // This programmatically triggers the nearest error boundary,
      // causing it to render its fallback UI.
      showBoundary(error);
    }
  }

  return <button onClick={handleExport}>Export Data</button>;
}
```

### Errors in useEffect

Errors thrown inside `useEffect` callbacks are also not caught by error boundaries, because effects run asynchronously after the render and commit phases are complete. A common pattern is to catch the error within the effect and store it in state, then throw during the next render:

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchUser() {
      try {
        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch user: ${response.status}`);
        }
        const data = await response.json();
        setUser(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
        }
      }
    }

    fetchUser();
    return () => controller.abort();
  }, [userId]);

  // Throw during render so the error boundary catches it
  if (error) {
    throw error;
  }

  if (!user) {
    return <p>Loading...</p>;
  }

  return <div>{user.name}</div>;
}
```

This pattern works because the `throw` statement executes during the render phase (when React calls the component function), which is exactly where error boundaries operate.

### Errors in React 19 Actions and Transitions

React 19 introduced Actions: async functions passed to `useTransition` or used as form actions. When an Action throws, React automatically handles the error through the error boundary mechanism. This is a significant improvement over manual error catching in `useEffect`:

```javascript
import { useTransition } from 'react';

function UpdateProfileForm({ userId }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    startTransition(async () => {
      // If this throws, React will propagate the error
      // to the nearest error boundary automatically.
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to update profile');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

### A Reusable Async Error Handler Hook

To reduce boilerplate, encapsulate the pattern of catching async errors and propagating them to boundaries:

```javascript
import { useCallback, useState } from 'react';

function useAsyncError() {
  const [, setError] = useState();

  // When called with an error, this triggers a re-render
  // that throws during the render phase, allowing the
  // nearest error boundary to catch it.
  const throwAsyncError = useCallback((error) => {
    setError(() => {
      throw error;
    });
  }, []);

  return throwAsyncError;
}

// Usage
function FileUploader() {
  const throwAsyncError = useAsyncError();

  async function handleUpload(file) {
    try {
      await uploadFile(file);
    } catch (error) {
      throwAsyncError(error);
    }
  }

  return (
    <input
      type="file"
      onChange={(e) => handleUpload(e.target.files[0])}
    />
  );
}
```

The trick is subtle: `setError` receives a callback that throws. React calls this callback during the render phase as part of processing the state update, so the throw occurs in the correct context for error boundaries to catch it.

> **Common Mistake:** Assuming that wrapping an async function call in an error boundary's child component is sufficient to catch async errors. The async operation completes outside of the render phase. You must either store the error in state and throw during render, use `showBoundary` from `react-error-boundary`, or use React 19 Actions with `useTransition`.

---

## 5.6 Global Error Tracking (Sentry, LogRocket Integration Patterns)

Production applications need more than fallback UI; they need observability. When an error occurs in a user's browser, the development team must be notified with enough context to diagnose and fix the issue. Error tracking services like Sentry and LogRocket capture errors, enrich them with context (user session, browser, component stack), and aggregate them for analysis.

### Integrating Sentry with React 19

Sentry's `@sentry/react` package provides first-class React integration. The setup connects to React 19's root-level error callbacks:

```javascript
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

// Initialize Sentry
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Capture 100% of transactions in development,
  // reduce in production based on volume
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // Capture 10% of sessions for replay,
  // but 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Connect to React 19's error callbacks
const root = createRoot(document.getElementById('root'), {
  onCaughtError: Sentry.reactErrorHandler(),
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
});

root.render(<App />);
```

### Using Sentry's ErrorBoundary Component

Sentry provides its own `ErrorBoundary` component that automatically reports errors:

```javascript
import * as Sentry from '@sentry/react';

function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div role="alert">
          <h2>Something went wrong</h2>
          <p>{error.message}</p>
          <button onClick={resetError}>Try Again</button>
        </div>
      )}
      beforeCapture={(scope) => {
        scope.setTag('section', 'dashboard');
      }}
    >
      <Dashboard />
    </Sentry.ErrorBoundary>
  );
}
```

### Building a Custom Error Reporting Layer

For applications that use multiple error tracking services or need a unified error processing pipeline, create an abstraction layer:

```javascript
// services/errorReporting.js

const reporters = [];

function registerReporter(reporter) {
  reporters.push(reporter);
}

function reportError(error, context = {}) {
  const enrichedContext = {
    ...context,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  reporters.forEach((reporter) => {
    try {
      reporter.captureError(error, enrichedContext);
    } catch (reportingError) {
      // Swallow errors from the reporter itself.
      // Never let error reporting break the application.
      console.error('Error reporting failed:', reportingError);
    }
  });
}

function reportWarning(message, context = {}) {
  reporters.forEach((reporter) => {
    try {
      reporter.captureWarning(message, context);
    } catch (reportingError) {
      console.error('Warning reporting failed:', reportingError);
    }
  });
}

export { registerReporter, reportError, reportWarning };
```

```javascript
// services/sentryReporter.js
import * as Sentry from '@sentry/react';

const sentryReporter = {
  captureError(error, context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  },

  captureWarning(message, context) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureMessage(message);
    });
  },
};

export { sentryReporter };
```

```javascript
// index.js
import { registerReporter, reportError } from './services/errorReporting';
import { sentryReporter } from './services/sentryReporter';

registerReporter(sentryReporter);

// Now use reportError throughout the application
```

### Connecting Error Boundaries to the Reporting Layer

Wire the error reporting layer into your error boundaries through the `onError` prop:

```javascript
import { reportError } from './services/errorReporting';

function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        reportError(error, {
          componentStack: errorInfo.componentStack,
          boundary: 'app-root',
        });
      }}
      fallback={<AppFallback />}
    >
      <AppContent />
    </ErrorBoundary>
  );
}
```

### Filtering and Enriching Errors

Not every error is actionable. Configure your error tracking to filter out noise:

```javascript
Sentry.init({
  dsn: '...',
  beforeSend(event, hint) {
    const error = hint.originalException;

    // Ignore errors from browser extensions
    if (error && error.stack && error.stack.includes('chrome-extension://')) {
      return null;
    }

    // Ignore network errors that are expected during offline usage
    if (error && error.name === 'TypeError' && error.message === 'Failed to fetch') {
      // Only report if the user is online, suggesting a server issue
      if (navigator.onLine) {
        return event;
      }
      return null;
    }

    // Ignore resize observer errors (common, usually harmless)
    if (error && error.message && error.message.includes('ResizeObserver')) {
      return null;
    }

    return event;
  },
});
```

### Stack Traces with `captureOwnerStack`

React 19 introduced `captureOwnerStack()`, which provides richer component stack traces showing the owner component chain rather than just the parent component chain. This is invaluable for debugging:

```javascript
import { captureOwnerStack } from 'react';

class ErrorBoundary extends Component {
  componentDidCatch(error, errorInfo) {
    const ownerStack = captureOwnerStack();
    reportError(error, {
      componentStack: errorInfo.componentStack,
      ownerStack,
    });
  }

  // ... rest of the boundary
}
```

---

## 5.7 Graceful Degradation vs Hard Failure

When an error occurs, the application must decide: should it continue operating with reduced functionality (graceful degradation), or should it stop and inform the user that a critical function has failed (hard failure)? This decision depends on the nature of the error, the affected feature, and the consequences of continuing with incorrect data or behavior.

### When to Degrade Gracefully

Graceful degradation is appropriate when the failed component is non-critical and the user can continue their primary task without it.

**Examples of graceful degradation:**

- A recommendation widget fails to load: show the page without recommendations
- A real-time notification feed errors: display a static "check notifications" link instead
- An analytics tracking script fails: the user's experience is unaffected
- A non-essential animation library throws: render without animation
- A secondary data visualization fails: show a text summary instead

```javascript
function ProductPage({ productId }) {
  return (
    <div className="product-page">
      {/* Critical: must work or the page is useless */}
      <ProductDetails productId={productId} />
      <AddToCartButton productId={productId} />

      {/* Non-critical: degrade gracefully */}
      <ErrorBoundary fallback={null}>
        <RecommendedProducts productId={productId} />
      </ErrorBoundary>

      <ErrorBoundary
        fallback={
          <p className="reviews-unavailable">
            Reviews are temporarily unavailable.
          </p>
        }
      >
        <ProductReviews productId={productId} />
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        <RecentlyViewed />
      </ErrorBoundary>
    </div>
  );
}
```

Notice that some fallbacks render `null`, completely hiding the failed section. This is appropriate when the section is supplementary and its absence is not confusing to the user.

### When to Fail Hard

Hard failure is appropriate when the error compromises data integrity, security, or the core purpose of the page. Continuing in a degraded state would be misleading or dangerous.

**Examples of hard failure:**

- A financial transaction form cannot validate inputs: do not allow submission
- Authentication state cannot be determined: do not render protected content
- A medical dosage calculator throws: do not display potentially incorrect values
- The data persistence layer fails: do not let the user continue entering data they might lose

```javascript
function TransactionForm() {
  return (
    <ErrorBoundary
      fallback={({ error }) => (
        <div role="alert" className="critical-error">
          <h2>Transaction Unavailable</h2>
          <p>
            The transaction form encountered an error and cannot
            process your request safely. Please try again later
            or contact support.
          </p>
          <p>Reference: {error.message}</p>
          <a href="/support">Contact Support</a>
        </div>
      )}
    >
      <TransactionFormContent />
    </ErrorBoundary>
  );
}
```

### A Decision Framework

Use the following questions to decide between degradation and hard failure:

1. **Can the user complete their primary task without this feature?** If yes, degrade gracefully. If no, fail hard.
2. **Could continuing with incorrect or missing data cause harm?** If yes (financial, medical, security contexts), fail hard.
3. **Would the user notice the degradation?** If the failed component is invisible or supplementary, degrade silently. If the failed component is central to the page, fail explicitly.
4. **Is the error recoverable?** If a retry is likely to succeed (transient network error), provide a retry mechanism. If the error is deterministic (bad data, missing required prop), fail hard with a clear message.

### Combining Both Strategies

In practice, a single page may use both strategies for different components:

```javascript
function CheckoutPage() {
  return (
    <div className="checkout">
      {/* Hard failure: these are essential for checkout */}
      <CartSummary />
      <PaymentForm />
      <ShippingForm />

      {/* Graceful degradation: nice to have, not essential */}
      <ErrorBoundary fallback={null}>
        <OrderSuggestions />
      </ErrorBoundary>

      <ErrorBoundary
        fallback={<p>Estimated delivery dates unavailable.</p>}
      >
        <DeliveryEstimates />
      </ErrorBoundary>
    </div>
  );
}
```

The cart summary, payment form, and shipping form are not wrapped in widget-level boundaries; they live under the page-level boundary. If any of them fails, the entire checkout page shows an error, because processing a checkout without any of these components would be incomplete and potentially harmful.

> **See Also:** Part 3, Chapter 5, Section 5.3 for the three-state pattern (loading, error, data) in data fetching, which provides a structured approach to per-request error handling.

---

## 5.8 Exercise: Add Comprehensive Error Handling to an Existing App

### Problem Statement

You are given a dashboard application that has no error handling. The application consists of a header, a sidebar navigation, and a main content area containing four widgets: a revenue chart, a user activity feed, a quick stats panel, and a notification center. Each widget fetches data from an API. Your task is to add a comprehensive error handling architecture.

### Requirements

1. Add a top-level error boundary that catches any unhandled error and displays a full-page fallback
2. Add route-level boundaries so that navigation remains functional when a page crashes
3. Add widget-level boundaries so that individual widget failures do not affect other widgets
4. Implement retry functionality for transient errors
5. Propagate errors from async operations to the nearest boundary
6. Add a centralized error reporting function that logs errors with context

### Starter Code

```javascript
// App.js (before error handling)
import { useState, useEffect } from 'react';

function Header() {
  return <header className="app-header"><h1>Dashboard</h1></header>;
}

function Sidebar() {
  return (
    <nav className="sidebar">
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
    </nav>
  );
}

function RevenueChart() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/revenue')
      .then(res => res.json())
      .then(setData);
  }, []);

  if (!data) return <p>Loading chart...</p>;
  return <div className="widget">{/* render chart */}</div>;
}

function ActivityFeed() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    fetch('/api/activities')
      .then(res => res.json())
      .then(setActivities);
  }, []);

  return (
    <ul className="widget">
      {activities.map(a => <li key={a.id}>{a.message}</li>)}
    </ul>
  );
}

function QuickStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(setStats);
  }, []);

  if (!stats) return <p>Loading stats...</p>;
  return (
    <div className="widget">
      <p>Users: {stats.users}</p>
      <p>Revenue: {stats.revenue}</p>
    </div>
  );
}

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(setNotifications);
  }, []);

  return (
    <div className="widget">
      {notifications.map(n => (
        <div key={n.id}>{n.text}</div>
      ))}
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="dashboard-grid">
      <RevenueChart />
      <ActivityFeed />
      <QuickStats />
      <NotificationCenter />
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar />
        <main>
          <DashboardPage />
        </main>
      </div>
    </div>
  );
}
```

### Solution

```javascript
// services/errorReporting.js
// Centralized error reporting that can be connected
// to any external service (Sentry, LogRocket, etc.)

function reportError(error, context = {}) {
  const errorReport = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    ...context,
  };

  // In production, send to an error tracking service.
  // In development, log to the console.
  if (process.env.NODE_ENV === 'production') {
    // Example: send to a logging endpoint
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorReport),
    }).catch(() => {
      // Swallow errors from the reporting mechanism itself.
      // Never let error reporting break the application.
    });
  } else {
    console.error('[Error Report]', errorReport);
  }
}

export { reportError };
```

```javascript
// components/ErrorBoundary.js
// A reusable error boundary with reset keys,
// retry support, and error reporting integration.

import { Component } from 'react';
import { reportError } from '../services/errorReporting';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Report to the centralized error service with context
    // about which boundary caught the error.
    reportError(error, {
      componentStack: errorInfo.componentStack,
      boundary: this.props.boundaryName || 'unnamed',
      level: this.props.level || 'unknown',
    });

    // Call the optional onError callback so parent components
    // can react to the error.
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps) {
    // Automatic reset when resetKeys change.
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      this.props.resetKeys.some(
        (key, i) => key !== (prevProps.resetKeys || [])[i]
      )
    ) {
      this.reset();
    }
  }

  reset() {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      // Support both static fallback elements and
      // render functions that receive error + reset.
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          reset: this.reset,
        });
      }
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
```

```javascript
// components/fallbacks.js
// Fallback UI components for different boundary levels.

function AppFallback() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1>Application Error</h1>
      <p>
        The application encountered an unexpected error.
        Please reload the page to continue.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
      >
        Reload Application
      </button>
    </div>
  );
}

function PageFallback({ error, reset }) {
  return (
    <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Page Error</h2>
      <p>This page could not be loaded. You can try again or navigate elsewhere.</p>
      <button onClick={reset} style={{ marginRight: '0.5rem' }}>
        Try Again
      </button>
    </div>
  );
}

function WidgetFallback({ error, reset, label }) {
  return (
    <div
      role="alert"
      className="widget"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: '#fef2f2',
        borderRadius: '0.5rem',
      }}
    >
      <p style={{ color: '#991b1b' }}>
        {label || 'This section'} is temporarily unavailable.
      </p>
      <button
        onClick={reset}
        style={{ marginTop: '0.5rem', padding: '0.25rem 0.75rem' }}
      >
        Retry
      </button>
    </div>
  );
}

export { AppFallback, PageFallback, WidgetFallback };
```

```javascript
// hooks/useAsyncError.js
// A hook that propagates async errors to the nearest
// error boundary by throwing during the render phase.

import { useCallback, useState } from 'react';

function useAsyncError() {
  const [, setError] = useState();

  const throwAsyncError = useCallback((error) => {
    setError(() => {
      throw error;
    });
  }, []);

  return throwAsyncError;
}

export { useAsyncError };
```

```javascript
// components/widgets.js
// Dashboard widgets with proper error handling.
// Each widget fetches data, handles errors via the
// useAsyncError hook, and supports abort on unmount.

import { useState, useEffect } from 'react';
import { useAsyncError } from '../hooks/useAsyncError';

function RevenueChart() {
  const [data, setData] = useState(null);
  const throwAsyncError = useAsyncError();

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        const response = await fetch('/api/revenue', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Revenue API returned ${response.status}`);
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          throwAsyncError(err);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, [throwAsyncError]);

  if (!data) return <p>Loading chart...</p>;
  return <div className="widget"><p>Revenue: ${data.total}</p></div>;
}

function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  const throwAsyncError = useAsyncError();

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        const response = await fetch('/api/activities', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Activities API returned ${response.status}`);
        }
        const json = await response.json();
        setActivities(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          throwAsyncError(err);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, [throwAsyncError]);

  return (
    <ul className="widget">
      {activities.map(a => <li key={a.id}>{a.message}</li>)}
    </ul>
  );
}

function QuickStats() {
  const [stats, setStats] = useState(null);
  const throwAsyncError = useAsyncError();

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        const response = await fetch('/api/stats', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Stats API returned ${response.status}`);
        }
        const json = await response.json();
        setStats(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          throwAsyncError(err);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, [throwAsyncError]);

  if (!stats) return <p>Loading stats...</p>;
  return (
    <div className="widget">
      <p>Users: {stats.users}</p>
      <p>Revenue: {stats.revenue}</p>
    </div>
  );
}

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const throwAsyncError = useAsyncError();

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        const response = await fetch('/api/notifications', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Notifications API returned ${response.status}`);
        }
        const json = await response.json();
        setNotifications(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          throwAsyncError(err);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, [throwAsyncError]);

  return (
    <div className="widget">
      {notifications.map(n => (
        <div key={n.id}>{n.text}</div>
      ))}
    </div>
  );
}

export { RevenueChart, ActivityFeed, QuickStats, NotificationCenter };
```

```javascript
// App.js (after error handling)
// The complete application with layered error boundaries
// at app, page, and widget levels.

import { ErrorBoundary } from './components/ErrorBoundary';
import {
  AppFallback,
  PageFallback,
  WidgetFallback,
} from './components/fallbacks';
import {
  RevenueChart,
  ActivityFeed,
  QuickStats,
  NotificationCenter,
} from './components/widgets';

function Header() {
  return <header className="app-header"><h1>Dashboard</h1></header>;
}

function Sidebar() {
  return (
    <nav className="sidebar">
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
    </nav>
  );
}

function DashboardPage() {
  return (
    <ErrorBoundary
      boundaryName="dashboard-page"
      level="page"
      fallback={({ error, reset }) => (
        <PageFallback error={error} reset={reset} />
      )}
    >
      <div className="dashboard-grid">
        {/* Each widget gets its own boundary so that one
            failing widget does not take down the others. */}
        <ErrorBoundary
          boundaryName="revenue-chart"
          level="widget"
          fallback={({ error, reset }) => (
            <WidgetFallback
              error={error}
              reset={reset}
              label="Revenue chart"
            />
          )}
        >
          <RevenueChart />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="activity-feed"
          level="widget"
          fallback={({ error, reset }) => (
            <WidgetFallback
              error={error}
              reset={reset}
              label="Activity feed"
            />
          )}
        >
          <ActivityFeed />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="quick-stats"
          level="widget"
          fallback={({ error, reset }) => (
            <WidgetFallback
              error={error}
              reset={reset}
              label="Quick stats"
            />
          )}
        >
          <QuickStats />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="notification-center"
          level="widget"
          fallback={({ error, reset }) => (
            <WidgetFallback
              error={error}
              reset={reset}
              label="Notification center"
            />
          )}
        >
          <NotificationCenter />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}

function App() {
  return (
    // App-level boundary: last resort for any uncaught error
    <ErrorBoundary
      boundaryName="app-root"
      level="app"
      fallback={<AppFallback />}
    >
      <div className="app">
        <Header />
        <div className="app-body">
          <Sidebar />
          <main>
            <DashboardPage />
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
```

### Key Takeaway

A comprehensive error handling architecture requires multiple layers. The `ErrorBoundary` class component is the foundation; the `useAsyncError` hook bridges the gap between async operations and boundary-based error catching; fallback UI components communicate errors at the appropriate scope; and a centralized reporting function ensures that every error is captured for diagnosis. The combination of these patterns creates an application that degrades gracefully under failure, recovers when possible, and provides full observability for the development team.

---

## Chapter Summary

Error handling in React requires a deliberate architectural approach, not ad-hoc `try/catch` blocks scattered throughout the codebase. Error boundaries, implemented as class components, catch errors during rendering and lifecycle methods, but they do not catch async or event handler errors. A layered boundary strategy (app, route, feature, widget) isolates failures to the smallest possible scope, keeping the rest of the application functional. Async errors require explicit propagation to boundaries via patterns like `useAsyncError` or `showBoundary`. React 19's root-level callbacks (`onCaughtError`, `onUncaughtError`, `onRecoverableError`) provide centralized hooks for connecting error tracking services. The choice between graceful degradation and hard failure depends on the criticality of the failed component: non-essential features should degrade silently, while data-integrity-critical features should fail explicitly.

## Further Reading

- [React Documentation: Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [React Documentation: createRoot (onCaughtError, onUncaughtError, onRecoverableError)](https://react.dev/reference/react-dom/client/createRoot)
- [React Documentation: captureOwnerStack](https://react.dev/reference/react/captureOwnerStack)
- [react-error-boundary library (npm)](https://www.npmjs.com/package/react-error-boundary)
- [Kent C. Dodds: Use react-error-boundary to Handle Errors in React](https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react)
- [Sentry React SDK Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry: React 19 Error Handling Support](https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/)
