# Part 4, Chapter 6: Testing Strategy

## What You Will Learn

- Apply the Testing Trophy model to determine the right distribution of static analysis, unit, integration, and end-to-end tests in a React project
- Write behavior-driven tests using React Testing Library's query priority hierarchy and `user-event` interactions
- Configure Vitest for a React project with jsdom or happy-dom, setup files, and coverage reporting
- Mock network requests at the service worker level using MSW v2 and its `http`/`HttpResponse` API
- Test custom hooks with `renderHook` and `act`, including hooks that depend on context providers
- Set up Playwright for end-to-end testing with page object models, CI sharding, and trace-based debugging
- Evaluate test coverage metrics critically, distinguishing between coverage that provides confidence and coverage that provides a false sense of security

---

## 6.1 The Testing Trophy: Static > Unit > Integration > E2E

The traditional testing pyramid, popularized by Martin Fowler, recommends many unit tests at the base, fewer integration tests in the middle, and a small number of end-to-end tests at the top. Kent C. Dodds proposed an alternative model for frontend applications: the Testing Trophy, which reshapes the distribution based on return on investment.

### The Trophy Shape

```
          ___
         / E2E \          <- Small: expensive, high confidence
        /________\
       /          \
      / Integration \     <- LARGEST: best ROI, realistic
     /______________\
    /    Unit Tests   \   <- Moderate: fast, isolated
   /___________________\
  /   Static Analysis    \ <- Foundation: cheapest, catches typos and type errors
 /_______________________\
```

**Static Analysis** forms the base. Tools like ESLint, Prettier, and (in typed codebases) type checkers catch entire categories of bugs before any test runs. A misconfigured ESLint rule can prevent more bugs than dozens of unit tests.

**Unit Tests** sit above static analysis. They test individual functions, utilities, and pure logic in isolation. They run fast and provide precise feedback about what broke. However, a passing unit test says nothing about whether the pieces work together correctly.

**Integration Tests** occupy the largest portion of the trophy. They test multiple components working together as a user would experience them: rendering a form, filling it out, submitting, and verifying the result. Integration tests provide the highest confidence-to-cost ratio because they verify real behavior without the brittleness of end-to-end tests.

**End-to-End (E2E) Tests** cap the trophy. They test the full application stack, including the real server, database, and browser. They are the most expensive to write and maintain, the slowest to run, and the most likely to be flaky. However, they catch problems that no other layer can, such as deployment configuration issues, server-side rendering mismatches, and cross-browser inconsistencies.

### The Core Mantra

Guillermo Rauch (creator of Next.js) summarized the philosophy that underpins the Testing Trophy:

> "Write tests. Not too many. Mostly integration."

This does not mean "skip unit tests" or "never write E2E tests." It means that when you are deciding where to invest your next testing effort, integration tests are usually the highest-value choice for React applications.

### Evolving Perspectives

As end-to-end testing tools like Playwright have matured, the cost of E2E tests has dropped significantly. Server-side rendering frameworks (Next.js, Remix, React Router v7) also blur the boundary between client and server, making integration tests harder to write without heavy mocking. Some practitioners now argue that E2E tests should grow in proportion. The trophy is a guide for allocation, not a rigid prescription.

> **See Also:** Part 4, Chapter 7, Section 7.4 for how dependency boundaries affect testability and the placement of test boundaries.

---

## 6.2 What to Test in React (Behavior, Not Implementation)

The single most important principle in React testing is: test what the user experiences, not how the component achieves it. This is the philosophy that React Testing Library was built around.

### Implementation Details vs. Behavior

An implementation detail is anything a user of the component would not directly observe. Internal state variable names, the number of re-renders, whether a component uses `useState` or `useReducer`, the structure of the component tree, and private helper functions are all implementation details.

Behavior is what the user sees and does: text on the screen, enabled or disabled buttons, form validation messages, navigation, and data that appears after loading.

```javascript
// BAD: Testing implementation details
test('sets isLoading state to true when fetch starts', () => {
  const { result } = renderHook(() => useUserData(1));
  // Directly inspecting internal state is an implementation detail.
  // If the hook renames the variable or restructures its state,
  // this test breaks despite identical behavior.
  expect(result.current.isLoading).toBe(true);
});

// GOOD: Testing behavior the user observes
test('shows a loading indicator while user data is being fetched', async () => {
  render(<UserProfile userId={1} />);
  // The user sees "Loading..." text. This test verifies
  // what the user actually experiences.
  expect(screen.getByText('Loading...')).toBeInTheDocument();

  // After loading completes, the user sees the profile.
  expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
});
```

### The Guiding Question

Before writing any test, ask: "If I refactor the component's internals without changing its behavior, will this test still pass?" If the answer is no, the test is coupled to implementation details and will create maintenance burden without providing proportional confidence.

### What to Test in a React Component

1. **Rendering output:** Given certain props, does the component render the expected text, elements, and attributes?
2. **User interactions:** When the user clicks, types, selects, or submits, does the UI respond correctly?
3. **Async behavior:** After data loads or an operation completes, does the UI update?
4. **Edge cases:** Empty states, error states, loading states, boundary conditions.
5. **Accessibility:** Are ARIA attributes correct? Is keyboard navigation functional?

### What Not to Test

1. **Internal state values** (the value of a `useState` variable)
2. **Component instance methods** (functions that are not exposed to the user)
3. **Render count** (how many times the component re-rendered)
4. **Prop types or prop shapes** (static analysis handles this)
5. **Third-party library internals** (trust that React Router, React Query, etc., work)

> **Common Mistake:** Writing tests that verify the component called `setState` with a specific value, or that a certain internal function was called a certain number of times. These tests break on refactor, pass on bugs (because the state could be correct while the rendered output is wrong), and provide a false sense of security.

---

## 6.3 Vitest/Jest Setup for React Projects

Vitest has become the preferred test runner for modern React projects. Built on Vite, it provides native ES module support, sub-second cold starts, and a watch mode that leverages Vite's module graph for targeted re-runs. Jest remains widely used in existing codebases, and the API surface is nearly identical.

### Vitest Setup

Install the required packages:

```javascript
// Terminal command (not a JavaScript file):
// npm install -D vitest @vitejs/plugin-react jsdom
// npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Configure Vitest in the project root:

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Make describe, test, expect available globally
    // without explicit imports.
    globals: true,

    // Use jsdom to simulate a browser environment.
    // Alternative: 'happy-dom' for faster but less complete simulation.
    environment: 'jsdom',

    // Run this file before every test file.
    setupFiles: './src/test/setup.js',

    // Use V8 for code coverage (faster than Istanbul).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.config.js',
      ],
    },
  },
});
```

Create the setup file that extends the matcher library:

```javascript
// src/test/setup.js
import '@testing-library/jest-dom';
```

This import adds DOM-specific matchers like `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()`, and `toBeDisabled()` to the `expect` API.

### jsdom vs. happy-dom

**jsdom** is the most complete browser simulation for Node.js. It implements a large subset of the Web API (DOM, CSSOM, Fetch, URL, etc.) with high fidelity. It is the safer default choice.

**happy-dom** is a lightweight alternative that runs two to three times faster than jsdom. It sacrifices some edge-case browser fidelity for speed. It is a strong choice for projects where test speed is a bottleneck and the tests do not depend on obscure Web API behaviors.

### Jest Equivalent

For projects using Jest, the setup is similar:

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['./src/test/setup.js'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
};
```

The key difference is that Jest requires Babel transforms for JSX, while Vitest uses Vite's native transform pipeline. The test API (`describe`, `test`, `expect`, `vi.fn()` / `jest.fn()`) is nearly identical between the two.

### Package Script

```javascript
// In package.json "scripts":
// "test": "vitest",
// "test:run": "vitest run",
// "test:coverage": "vitest run --coverage"
```

Running `vitest` without `run` starts watch mode, which re-runs tests on file changes using Vite's module graph to determine which tests are affected.

---

## 6.4 React Testing Library Philosophy and Patterns

React Testing Library (RTL) was created by Kent C. Dodds to encourage tests that resemble how users interact with the application. Its guiding principle is:

> "The more your tests resemble the way your software is used, the more confidence they can give you."

### The Query Priority

RTL provides multiple query methods. They are not interchangeable; they form a deliberate priority hierarchy based on accessibility and user perception:

**Tier 1: Queries accessible to everyone (visual, mouse, assistive technology)**

| Query | Use Case |
|-------|----------|
| `getByRole` | Buttons, links, headings, form controls. The primary query. |
| `getByLabelText` | Form fields associated with a `<label>`. |
| `getByPlaceholderText` | Inputs with placeholder text (when no label exists). |
| `getByText` | Non-interactive text content. |
| `getByDisplayValue` | Inputs, selects, textareas showing a current value. |

**Tier 2: Semantic queries**

| Query | Use Case |
|-------|----------|
| `getByAltText` | Images and elements with `alt` attributes. |
| `getByTitle` | Elements with `title` attributes. |

**Tier 3: Test IDs (last resort)**

| Query | Use Case |
|-------|----------|
| `getByTestId` | When no semantic query works. Invisible to the user. |

### Using `screen`

Always import and use the `screen` object rather than destructuring from `render()`. This keeps tests consistent and avoids stale references:

```javascript
import { render, screen } from '@testing-library/react';

test('renders the greeting', () => {
  render(<Greeting name="Alice" />);

  // Preferred: use screen
  expect(screen.getByText('Hello, Alice')).toBeInTheDocument();
});
```

### Query Variants

Each query name (e.g., `ByRole`) is available in three variants:

| Variant | Behavior | Use When |
|---------|----------|----------|
| `getBy*` | Throws if not found. Returns element synchronously. | Element should be present right now. |
| `queryBy*` | Returns `null` if not found. Does not throw. | Asserting that an element does NOT exist. |
| `findBy*` | Returns a promise. Retries until found or timeout. | Element appears asynchronously. |

```javascript
// Element should exist right now
const heading = screen.getByRole('heading', { name: 'Dashboard' });

// Asserting an element is gone
expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

// Waiting for async content to appear
const userName = await screen.findByText('Jane Doe');
```

### Example: Testing a Login Form

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

test('submits email and password when the form is filled and submitted', async () => {
  const handleSubmit = vi.fn();
  const user = userEvent.setup();

  render(<LoginForm onSubmit={handleSubmit} />);

  // Query form fields by their accessible label
  await user.type(screen.getByLabelText('Email'), 'alice@example.com');
  await user.type(screen.getByLabelText('Password'), 'securepass123');
  await user.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(handleSubmit).toHaveBeenCalledWith({
    email: 'alice@example.com',
    password: 'securepass123',
  });
});

test('shows validation error when email is empty', async () => {
  const user = userEvent.setup();
  render(<LoginForm onSubmit={vi.fn()} />);

  // Submit without filling email
  await user.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
});
```

> **Common Mistake:** Using `container.querySelector('.submit-btn')` to find elements. This bypasses RTL's accessibility-first design and couples tests to CSS class names, which are implementation details. If the class name changes during a styling refactor, the test breaks despite identical behavior. Use `getByRole('button', { name: 'Sign In' })` instead.

---

## 6.5 Testing User Interactions (Click, Type, Select, Submit)

`@testing-library/user-event` is the recommended library for simulating user interactions. Unlike `fireEvent` (which dispatches a single DOM event), `user-event` simulates the full sequence of events that a real user interaction produces. For example, typing a character fires `keyDown`, `keyPress`, `input`, and `keyUp` events in sequence, which is how browsers actually work.

### Setup

Always call `userEvent.setup()` at the beginning of a test. This creates a user instance with consistent configuration:

```javascript
import userEvent from '@testing-library/user-event';

test('interaction example', async () => {
  const user = userEvent.setup();
  render(<MyComponent />);

  // All interactions go through the user instance.
  await user.click(screen.getByRole('button'));
});
```

### Click Interactions

```javascript
test('toggles the dropdown when the trigger button is clicked', async () => {
  const user = userEvent.setup();
  render(<Dropdown label="Options" items={['Edit', 'Delete']} />);

  const trigger = screen.getByRole('button', { name: 'Options' });

  // Dropdown is closed initially
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

  // Open the dropdown
  await user.click(trigger);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Edit' })).toBeInTheDocument();

  // Close the dropdown
  await user.click(trigger);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
```

### Typing

`user.type` simulates typing character by character. `user.clear` clears an input. `user.keyboard` simulates arbitrary keyboard sequences:

```javascript
test('filters the product list as the user types', async () => {
  const user = userEvent.setup();
  render(<ProductSearch products={mockProducts} />);

  const searchInput = screen.getByRole('searchbox', { name: 'Search products' });

  await user.type(searchInput, 'laptop');

  // Only products matching "laptop" should be visible
  expect(screen.getByText('Gaming Laptop Pro')).toBeInTheDocument();
  expect(screen.queryByText('Wireless Mouse')).not.toBeInTheDocument();

  // Clearing the search shows all products again
  await user.clear(searchInput);
  expect(screen.getByText('Wireless Mouse')).toBeInTheDocument();
});
```

### Select and Option Interactions

```javascript
test('updates the sort order when a new option is selected', async () => {
  const user = userEvent.setup();
  render(<ProductList products={mockProducts} />);

  const sortSelect = screen.getByRole('combobox', { name: 'Sort by' });

  await user.selectOptions(sortSelect, 'price-desc');

  expect(sortSelect).toHaveValue('price-desc');
  // Verify the list re-ordered: first product should be the most expensive
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('Premium Headphones');
});
```

### Form Submission

```javascript
test('submits the contact form and shows a success message', async () => {
  const user = userEvent.setup();
  render(<ContactForm />);

  await user.type(screen.getByLabelText('Name'), 'Alice Johnson');
  await user.type(screen.getByLabelText('Email'), 'alice@example.com');
  await user.type(screen.getByLabelText('Message'), 'I have a question about pricing.');

  await user.click(screen.getByRole('button', { name: 'Send Message' }));

  // Wait for the async submission to complete
  expect(await screen.findByText('Message sent successfully!')).toBeInTheDocument();
});
```

### Keyboard Navigation

```javascript
test('navigates menu items with arrow keys', async () => {
  const user = userEvent.setup();
  render(<NavigationMenu items={['Home', 'Products', 'About']} />);

  // Tab into the menu
  await user.tab();
  expect(screen.getByRole('menuitem', { name: 'Home' })).toHaveFocus();

  // Arrow down to the next item
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'Products' })).toHaveFocus();

  // Press Enter to activate
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
});
```

> **See Also:** Part 3, Chapter 9, Section 9.3 for keyboard navigation patterns in React, and Part 3, Chapter 6, Section 6.4 for form validation patterns that should be tested.

---

## 6.6 Testing Async Behavior (waitFor, findBy, Fake Timers)

React applications are inherently asynchronous. Data fetching, debounced inputs, animations, and state transitions all involve delays. Testing async behavior requires tools that can wait for the UI to update.

### `findBy*` Queries

`findBy*` queries return a promise that resolves when the matching element appears in the DOM. They retry on an interval (default: 50ms) until a timeout (default: 1000ms) is reached:

```javascript
test('displays user data after the API responds', async () => {
  render(<UserProfile userId={42} />);

  // The component fetches data on mount.
  // findByText waits until "Alice Johnson" appears.
  const userName = await screen.findByText('Alice Johnson');
  expect(userName).toBeInTheDocument();
});
```

### `waitFor`

`waitFor` repeatedly executes a callback until it stops throwing, or until the timeout expires. Use it when you need to assert a condition that depends on async state changes:

```javascript
import { render, screen, waitFor } from '@testing-library/react';

test('disables the submit button while saving', async () => {
  const user = userEvent.setup();
  render(<SettingsForm />);

  await user.click(screen.getByRole('button', { name: 'Save' }));

  // waitFor retries the assertion until the button becomes disabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
```

**Important rules for `waitFor`:**

1. Place only one assertion inside each `waitFor` callback. Multiple assertions delay failure detection because `waitFor` retries the entire callback on any assertion failure.
2. Do not put side effects inside `waitFor`. The callback may be invoked many times.
3. Prefer `findBy*` over `waitFor` + `getBy*` when you are simply waiting for an element to appear.

### `waitForElementToBeRemoved`

Use this to wait for an element to disappear:

```javascript
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';

test('removes the loading spinner when data loads', async () => {
  render(<Dashboard />);

  // Loading spinner is present initially
  expect(screen.getByText('Loading...')).toBeInTheDocument();

  // Wait for the spinner to disappear
  await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

  // Dashboard content is now visible
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
});
```

### Fake Timers

For components that use `setTimeout`, `setInterval`, or `debounce`, fake timers allow tests to control time without waiting:

```javascript
import { render, screen, act } from '@testing-library/react';

test('shows a notification and auto-dismisses it after 5 seconds', () => {
  vi.useFakeTimers();

  render(<Notification message="Saved!" duration={5000} />);
  expect(screen.getByText('Saved!')).toBeInTheDocument();

  // Advance time by 5 seconds
  act(() => {
    vi.advanceTimersByTime(5000);
  });

  expect(screen.queryByText('Saved!')).not.toBeInTheDocument();

  vi.useRealTimers();
});
```

```javascript
test('debounced search waits 300ms before filtering', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<DebouncedSearch onSearch={vi.fn()} />);

  await user.type(screen.getByRole('searchbox'), 'react');

  // Before the debounce delay, onSearch has not been called
  expect(screen.queryByText('Searching...')).not.toBeInTheDocument();

  // Advance past the debounce threshold
  act(() => {
    vi.advanceTimersByTime(300);
  });

  // Now the search should trigger
  expect(await screen.findByText('Searching...')).toBeInTheDocument();

  vi.useRealTimers();
});
```

Note the `{ advanceTimers: vi.advanceTimersByTime }` option passed to `userEvent.setup()`. This is necessary when using fake timers with `user-event`, because `user-event` internally uses `setTimeout` to sequence events. Without this option, interactions will hang indefinitely.

---

## 6.7 Testing Custom Hooks

Custom hooks encapsulate reusable logic. Testing them requires rendering them within a React component, because hooks can only execute inside the React rendering lifecycle.

### `renderHook`

The `renderHook` utility (included in `@testing-library/react` since v13) renders a hook inside a minimal wrapper component:

```javascript
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

test('initializes with the given starting value', () => {
  const { result } = renderHook(() => useCounter(10));
  expect(result.current.count).toBe(10);
});

test('increments the counter', () => {
  const { result } = renderHook(() => useCounter(0));

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(1);
});

test('decrements the counter but not below zero', () => {
  const { result } = renderHook(() => useCounter(0));

  act(() => {
    result.current.decrement();
  });

  // The hook enforces a minimum of 0
  expect(result.current.count).toBe(0);
});
```

`result.current` always points to the latest return value of the hook. After any state update (wrapped in `act`), `result.current` reflects the new state.

### Testing Hooks That Depend on Context

When a hook reads from a React context, the `renderHook` call must provide that context via a wrapper:

```javascript
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function createWrapper() {
  return function Wrapper({ children }) {
    return (
      <AuthProvider>
        {children}
      </AuthProvider>
    );
  };
}

test('returns the current user from auth context', () => {
  const { result } = renderHook(() => useAuth(), {
    wrapper: createWrapper(),
  });

  expect(result.current.user).toBeNull();
  expect(result.current.isAuthenticated).toBe(false);
});

test('updates auth state after login', async () => {
  const { result } = renderHook(() => useAuth(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    await result.current.login('alice@example.com', 'password123');
  });

  expect(result.current.isAuthenticated).toBe(true);
  expect(result.current.user.email).toBe('alice@example.com');
});
```

### Testing Hooks with Async Logic

Hooks that perform async operations (data fetching, timers) require `async` act blocks:

```javascript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUserData } from './useUserData';

test('fetches user data on mount', async () => {
  const { result } = renderHook(() => useUserData(42));

  // Initially loading
  expect(result.current.isLoading).toBe(true);

  // Wait for the fetch to complete
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  expect(result.current.data.name).toBe('Alice Johnson');
  expect(result.current.error).toBeNull();
});
```

### When to Use `renderHook` vs. a Test Component

`renderHook` is ideal for testing the hook's API in isolation: its return values, state transitions, and edge cases. However, for complex hooks where the interaction between the hook's state and the rendered UI matters, testing through a real component provides higher confidence:

```javascript
// Testing via a real component: higher confidence
test('useSearch filters results and displays them', async () => {
  const user = userEvent.setup();
  // SearchableList uses useSearch internally
  render(<SearchableList items={mockItems} />);

  await user.type(screen.getByRole('searchbox'), 'react');

  expect(screen.getByText('React Hooks Guide')).toBeInTheDocument();
  expect(screen.queryByText('Vue Composition API')).not.toBeInTheDocument();
});
```

> **See Also:** Part 4, Chapter 2, Section 2.6 for the design principles of testable custom hooks.

---

## 6.8 Mocking: API Calls (MSW), Modules, Context, Router

Mocking replaces real dependencies with controlled substitutes so that tests remain fast, deterministic, and isolated. The key principle is: mock at the lowest level necessary to maintain realistic behavior.

### API Mocking with MSW (Mock Service Worker)

MSW intercepts network requests at the service worker level. Unlike mocking `fetch` or Axios directly, MSW allows your application code to execute its real networking logic. The only difference is that the request never reaches a real server; MSW intercepts it and returns a predefined response.

**Handler setup (MSW v2 API):**

```javascript
// src/test/handlers.js
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users/:userId', ({ params }) => {
    const { userId } = params;

    if (userId === '404') {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      id: userId,
      name: 'Alice Johnson',
      email: 'alice@example.com',
    });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: 'new-123', ...body },
      { status: 201 }
    );
  }),

  http.get('/api/products', ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    const products = [
      { id: 1, name: 'Laptop', category: 'electronics' },
      { id: 2, name: 'Shirt', category: 'clothing' },
      { id: 3, name: 'Phone', category: 'electronics' },
    ];

    const filtered = category
      ? products.filter(p => p.category === category)
      : products;

    return HttpResponse.json(filtered);
  }),
];
```

**Server setup:**

```javascript
// src/test/server.js
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**Integration in the test setup file:**

```javascript
// src/test/setup.js
import '@testing-library/jest-dom';
import { server } from './server';

// Start intercepting requests before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers between tests so that one test's overrides
// do not leak into another test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

The `onUnhandledRequest: 'error'` option causes the test to fail if any request is made that does not match a handler. This prevents accidental real network calls in tests.

**Overriding handlers per test:**

```javascript
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';

test('shows an error message when the API returns 500', async () => {
  // Override the handler for this specific test
  server.use(
    http.get('/api/users/:userId', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  render(<UserProfile userId={42} />);

  expect(await screen.findByText('Failed to load user data')).toBeInTheDocument();
});
```

### Module Mocking

When a component imports a module that produces side effects or is difficult to control (e.g., a date library, a random ID generator, or a browser API), mock the module:

```javascript
// Mock a module that generates unique IDs
vi.mock('./utils/generateId', () => ({
  generateId: vi.fn(() => 'test-id-001'),
}));

test('creates a new item with a generated ID', async () => {
  const user = userEvent.setup();
  render(<ItemCreator />);

  await user.type(screen.getByLabelText('Item name'), 'New Widget');
  await user.click(screen.getByRole('button', { name: 'Create' }));

  expect(screen.getByTestId('item-id')).toHaveTextContent('test-id-001');
});
```

### Mocking Context

Test components that consume context by wrapping them in a provider with controlled values:

```javascript
import { ThemeContext } from './ThemeContext';

function renderWithTheme(ui, { theme = 'light' } = {}) {
  return render(
    <ThemeContext.Provider value={{ theme, toggleTheme: vi.fn() }}>
      {ui}
    </ThemeContext.Provider>
  );
}

test('renders dark mode styles when theme is dark', () => {
  renderWithTheme(<Header />, { theme: 'dark' });

  expect(screen.getByRole('banner')).toHaveClass('header-dark');
});
```

### Mocking the Router

Components that use routing hooks (`useNavigate`, `useParams`, `useLocation`) need a router context:

```javascript
import { MemoryRouter, Route, Routes } from 'react-router-dom';

function renderWithRouter(ui, { initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  );
}

test('displays the product detail for the given route param', () => {
  render(
    <MemoryRouter initialEntries={['/products/42']}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.getByRole('heading')).toHaveTextContent('Product #42');
});
```

`MemoryRouter` keeps the routing history in memory, making it ideal for tests that do not need a real browser URL bar.

---

## 6.9 Snapshot Testing: When It Is Useful, When It Is Noise

Snapshot testing captures a serialized representation of a component's rendered output and compares it against a previously stored reference. If the output changes, the test fails, and the developer must either fix a regression or update the snapshot.

### How Snapshots Work

```javascript
import { render } from '@testing-library/react';

test('renders the product card correctly', () => {
  const { container } = render(
    <ProductCard
      name="Wireless Headphones"
      price={79.99}
      inStock={true}
    />
  );

  expect(container.firstChild).toMatchSnapshot();
});
```

The first time this test runs, Vitest/Jest creates a `.snap` file containing the serialized HTML. On subsequent runs, the output is compared to the stored snapshot. Any change (a new class, a different text node, a restructured element) causes a failure.

### When Snapshots Are Useful

1. **Stable, presentational components.** A `Badge` component that renders a `<span>` with a class name based on a `variant` prop is a good candidate. Its output is small, stable, and easy to review in a diff.
2. **Detecting unintended changes.** When a library update or a refactor inadvertently changes the rendered output, a snapshot test catches it.
3. **Serialized data structures.** Snapshots can capture any serializable value, not just DOM. Configuration objects, API response shapes, or state machine transitions can be snapshot-tested.

### When Snapshots Are Noise

1. **Large components.** A snapshot of a full page produces hundreds of lines of HTML. Reviewing these diffs is tedious, and developers often rubber-stamp snapshot updates without careful review, which defeats the purpose.
2. **Frequently changing components.** Components under active development produce constant snapshot failures. The team wastes time updating snapshots rather than writing meaningful assertions.
3. **Dynamic content.** Components that include timestamps, random IDs, or user-specific data produce different output on every run. These require snapshot serializers or manual data stabilization, adding complexity.

### Inline Snapshots

For small outputs, inline snapshots embed the expected output directly in the test file:

```javascript
test('renders the badge with correct text', () => {
  const { container } = render(<Badge variant="success">Active</Badge>);

  expect(container.firstChild).toMatchInlineSnapshot(`
    <span
      class="badge badge-success"
    >
      Active
    </span>
  `);
});
```

Inline snapshots are easier to review because the expected output is visible alongside the test logic.

### Guidelines

1. Keep snapshot scope small. Snapshot individual components, not entire pages.
2. Use inline snapshots for components with less than ten lines of output.
3. Always review snapshot diffs carefully before updating. A `--update` flag should trigger a careful review, not a reflexive approval.
4. Combine snapshots with behavioral tests. A snapshot verifies structure; behavioral tests verify that interactions work. Neither alone is sufficient.

> **Common Mistake:** Relying exclusively on snapshot tests for a component and considering it "fully tested." Snapshot tests verify structure (what the HTML looks like) but say nothing about behavior (what happens when the user clicks a button). A component can have a perfect snapshot and still be completely non-functional. Snapshots supplement behavioral tests; they do not replace them.

---

## 6.10 Integration Tests: Testing Features End-to-End

Integration tests occupy the largest portion of the Testing Trophy because they provide the highest confidence-to-cost ratio. An integration test renders a feature as the user would experience it, including its child components, hooks, context providers, and (mocked) API layer. It tests that these pieces work together correctly.

### What Makes a Test "Integration"

A unit test isolates a single function or component from its dependencies. An integration test renders a realistic slice of the application: a page, a feature, or a workflow that spans multiple components. The key distinction is that integration tests do not mock internal components or hooks; they mock only external boundaries (network, browser APIs).

### Example: Testing a Product Catalog Feature

The product catalog includes a search input, a category filter, a product list, and a pagination control. An integration test covers the full workflow:

```javascript
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { ProductCatalog } from './ProductCatalog';

// Default handlers return a predictable set of products.
// See Section 6.8 for the handler definitions.

test('filters products by category and displays results', async () => {
  const user = userEvent.setup();
  render(<ProductCatalog />);

  // Wait for initial product list to load
  expect(await screen.findByText('Laptop')).toBeInTheDocument();
  expect(screen.getByText('Shirt')).toBeInTheDocument();
  expect(screen.getByText('Phone')).toBeInTheDocument();

  // Select the "Electronics" category filter
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Category' }),
    'electronics'
  );

  // Wait for filtered results
  expect(await screen.findByText('Laptop')).toBeInTheDocument();
  expect(screen.getByText('Phone')).toBeInTheDocument();
  expect(screen.queryByText('Shirt')).not.toBeInTheDocument();
});

test('shows an empty state when no products match the search', async () => {
  const user = userEvent.setup();
  render(<ProductCatalog />);

  await screen.findByText('Laptop'); // wait for load

  await user.type(
    screen.getByRole('searchbox', { name: 'Search products' }),
    'xyznonexistent'
  );

  expect(await screen.findByText('No products found')).toBeInTheDocument();
});

test('navigates between pages of results', async () => {
  // Override handler to return paginated data
  server.use(
    http.get('/api/products', ({ request }) => {
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const products = page === 1
        ? [{ id: 1, name: 'Page 1 Product', category: 'misc' }]
        : [{ id: 2, name: 'Page 2 Product', category: 'misc' }];
      return HttpResponse.json({
        products,
        totalPages: 2,
        currentPage: page,
      });
    })
  );

  const user = userEvent.setup();
  render(<ProductCatalog />);

  // Page 1 content
  expect(await screen.findByText('Page 1 Product')).toBeInTheDocument();

  // Navigate to page 2
  await user.click(screen.getByRole('button', { name: 'Next page' }));

  expect(await screen.findByText('Page 2 Product')).toBeInTheDocument();
  expect(screen.queryByText('Page 1 Product')).not.toBeInTheDocument();
});
```

### Integration Test Structure

A well-structured integration test follows the Arrange-Act-Assert pattern:

1. **Arrange:** Render the feature with any necessary providers, set up MSW handlers for expected API calls.
2. **Act:** Simulate user interactions (type, click, select, navigate).
3. **Assert:** Verify the resulting UI state (text, elements, attributes, absence of elements).

### Custom Render Functions

Most integration tests need the same set of providers (Router, Theme, Auth). Create a custom `render` function to avoid repetition:

```javascript
// src/test/utils.js
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Do not retry failed queries in tests
      },
    },
  });
}

function renderWithProviders(ui, { route = '/', ...options } = {}) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>
            {children}
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

export { renderWithProviders };
```

```javascript
// Usage in a test
import { renderWithProviders } from '../test/utils';

test('dashboard page loads user data', async () => {
  renderWithProviders(<DashboardPage />, { route: '/dashboard' });
  expect(await screen.findByText('Welcome, Alice')).toBeInTheDocument();
});
```

---

## 6.11 E2E with Playwright: Setup, Page Objects, CI Integration

End-to-end tests verify the full application stack: real browser, real (or close-to-real) server, real database. Playwright is the leading E2E testing framework, offering cross-browser support (Chromium, Firefox, WebKit), auto-waiting, and built-in tooling for debugging.

### Setup

```javascript
// Terminal command:
// npm init playwright@latest

// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start the dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Writing E2E Tests

Playwright tests use locators that auto-wait for elements to be actionable before interacting with them:

```javascript
// e2e/auth.spec.js
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can log in and see the dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('alice@example.com');
    await page.getByLabel('Password').fill('securepass123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Playwright auto-waits for navigation and element visibility
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Welcome, Alice')).toBeVisible();
  });

  test('shows validation errors for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('badpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  });
});
```

### The Page Object Model

For larger test suites, the Page Object Model (POM) encapsulates page-specific locators and actions in reusable classes:

```javascript
// e2e/pages/LoginPage.js
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.errorAlert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

```javascript
// e2e/pages/DashboardPage.js
export class DashboardPage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.welcomeMessage = page.getByTestId('welcome-message');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
```

```javascript
// e2e/auth.spec.js (refactored with POM)
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

test('user can log in and see the dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);

  await loginPage.goto();
  await loginPage.login('alice@example.com', 'securepass123');
  await dashboardPage.expectLoaded();
});
```

### Mocking APIs in Playwright

Playwright can intercept and mock network requests without MSW:

```javascript
test('displays products from the mocked API', async ({ page }) => {
  // Intercept the API call and return mock data
  await page.route('/api/products', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Mocked Laptop', price: 999 },
        { id: 2, name: 'Mocked Phone', price: 699 },
      ]),
    });
  });

  await page.goto('/products');
  await expect(page.getByText('Mocked Laptop')).toBeVisible();
  await expect(page.getByText('Mocked Phone')).toBeVisible();
});
```

### CI Integration

For continuous integration, configure Playwright to run efficiently:

```javascript
// In playwright.config.js
export default defineConfig({
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  use: {
    // Capture traces on first retry for debugging CI failures.
    // Traces include DOM snapshots, network requests, and
    // console logs at each step.
    trace: 'on-first-retry',

    // Do not capture screenshots and video by default
    // (traces are more useful and cheaper).
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
```

For large test suites, use sharding to distribute tests across multiple CI machines:

```javascript
// CI pipeline (e.g., GitHub Actions):
// npx playwright test --shard=1/4
// npx playwright test --shard=2/4
// npx playwright test --shard=3/4
// npx playwright test --shard=4/4
```

### Web-First Assertions

Playwright's assertion library auto-retries assertions until they pass or time out. Always use these assertions rather than manual boolean checks:

```javascript
// CORRECT: auto-waits and retries
await expect(page.getByText('Saved!')).toBeVisible();

// INCORRECT: evaluates once, may be flaky
const isVisible = await page.getByText('Saved!').isVisible();
expect(isVisible).toBe(true);
```

---

## 6.12 Visual Regression Testing (Chromatic, Percy)

Visual regression testing captures screenshots of UI components and compares them pixel-by-pixel against baselines. It catches visual regressions that behavioral tests miss: spacing changes, color shifts, font rendering differences, layout breakage, and z-index conflicts.

### Chromatic

Chromatic is built by the same team that maintains Storybook. It uses existing Storybook stories as visual test cases:

1. **Write stories.** Each story renders a component in a specific state (default, loading, error, dark mode, mobile viewport).
2. **Chromatic captures.** On each commit, Chromatic renders every story in a standardized cloud environment and captures screenshots.
3. **Diff and review.** New screenshots are compared to baselines. Visual changes appear as highlighted diffs in the Chromatic web UI.
4. **Approve or reject.** A human reviewer approves intentional changes (updating the baseline) or rejects regressions. CI status checks reflect the review state.

```javascript
// stories/Button.stories.js
export default {
  title: 'Components/Button',
  component: Button,
};

export const Primary = {
  args: { variant: 'primary', children: 'Submit' },
};

export const Secondary = {
  args: { variant: 'secondary', children: 'Cancel' },
};

export const Disabled = {
  args: { variant: 'primary', children: 'Submit', disabled: true },
};

export const Loading = {
  args: { variant: 'primary', children: 'Submit', isLoading: true },
};
```

Each of these stories becomes a visual test case automatically. No additional test code is needed.

### Chromatic Configuration

```javascript
// Terminal command:
// npx chromatic --project-token=YOUR_TOKEN

// In package.json "scripts":
// "chromatic": "chromatic --exit-zero-on-changes"
```

The `--exit-zero-on-changes` flag prevents CI from failing on detected changes; instead, changes are queued for human review in the Chromatic dashboard.

### Percy (BrowserStack)

Percy is an alternative that works with multiple test frameworks, not just Storybook. It integrates with Playwright, Cypress, and Puppeteer for full-page visual testing:

```javascript
// e2e/visual.spec.js (Playwright + Percy)
import { test } from '@playwright/test';
import percySnapshot from '@percy/playwright';

test('product page visual snapshot', async ({ page }) => {
  await page.goto('/products/42');
  await page.waitForSelector('[data-loaded="true"]');

  await percySnapshot(page, 'Product Detail Page');
});

test('product page dark mode', async ({ page }) => {
  await page.goto('/products/42?theme=dark');
  await page.waitForSelector('[data-loaded="true"]');

  await percySnapshot(page, 'Product Detail Page - Dark Mode');
});
```

### When to Use Visual Regression Testing

Visual regression testing is most valuable for:

1. **Design systems.** Catching unintended style changes across shared components.
2. **Cross-browser rendering.** Verifying that the UI looks correct in Chrome, Firefox, and Safari simultaneously.
3. **Responsive layouts.** Testing that components render correctly at multiple viewport widths.
4. **Theme support.** Ensuring dark mode, high contrast, and other themes render without artifacts.

It is less valuable for:

1. **Dynamic content.** Pages with real-time data or user-generated content produce noisy diffs.
2. **Early-stage development.** Components that change frequently generate constant false positives.

---

## 6.13 Test Coverage: What Metrics Actually Matter

Code coverage measures the percentage of code executed during test runs. It is a useful signal when interpreted correctly and a dangerous metric when used as a target.

### Coverage Types

| Metric | What It Measures |
|--------|-----------------|
| **Statement coverage** | Percentage of statements executed at least once. |
| **Branch coverage** | Percentage of conditional branches (if/else, ternary, switch cases) taken. |
| **Function coverage** | Percentage of functions called at least once. |
| **Line coverage** | Percentage of lines executed (similar to statement, but line-based). |

### Configuring Coverage in Vitest

```javascript
// vitest.config.js (inside the test object)
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  thresholds: {
    // Set realistic minimums, not aspirational targets.
    statements: 70,
    branches: 65,
    functions: 70,
    lines: 70,
  },
  exclude: [
    'node_modules/',
    'src/test/',
    'src/**/*.stories.js',
    'src/**/index.js', // barrel files
  ],
}
```

### What Coverage Tells You

Coverage tells you which code was **executed** during tests. If a line has zero coverage, no test exercised it, which means no test would catch a bug on that line. This is a useful signal: uncovered code is untested code.

### What Coverage Does Not Tell You

Coverage does not tell you whether the tests are **good**. A test that renders a component without any assertions achieves 100% statement coverage for that component while verifying nothing. Coverage measures execution, not correctness.

```javascript
// This test achieves 100% statement coverage for UserCard.
// It verifies nothing.
test('renders without crashing', () => {
  render(<UserCard user={mockUser} />);
  // No assertions. This test provides zero confidence.
});
```

### Meaningful Coverage Targets

1. **Do not aim for 100%.** Covering every line incentivizes writing low-value tests for trivial code (re-exports, constants, type guards). The marginal cost of the last 10% of coverage far exceeds its value.
2. **70-80% is a practical target** for most React projects. This threshold catches meaningful regressions without encouraging test bloat.
3. **Focus on critical paths.** Authentication, payment processing, data mutations, and error handling deserve near-complete coverage. Marketing pages and static content do not.
4. **Use coverage as a floor, not a ceiling.** Coverage should prevent regressions in discipline ("we should not drop below 70%") rather than create pressure to inflate ("we must reach 95%").
5. **Branch coverage matters more than line coverage.** Conditional logic is where bugs hide. A component that handles loading, error, empty, and data states has four branches; covering only the happy path is insufficient.

### Identifying Meaningful Gaps

Rather than chasing a number, use the HTML coverage report to find meaningful gaps:

```javascript
// Terminal command:
// npx vitest run --coverage
// Open coverage/index.html in a browser
```

Look for uncovered lines in:
- Error handling code (`catch` blocks, error boundaries)
- Conditional branches (edge cases, empty states)
- User interaction handlers (submit, delete, navigate)

These are the gaps worth filling. Uncovered code in barrel files, constant definitions, or configuration files is rarely worth testing.

> **Common Mistake:** Setting a 100% coverage requirement and then writing tests like `test('renders', () => { render(<Component />) })` to satisfy it. These tests execute every line but assert nothing. They create a false sense of security and slow down the test suite without catching any bugs. Coverage thresholds should be accompanied by code review practices that evaluate test quality, not just quantity.

---

## 6.14 Exercise: Write a Complete Test Suite for a Feature (Unit + Integration + E2E)

### Problem Statement

Build a complete test suite for a "Todo List" feature. The feature includes:

- Displaying a list of todos fetched from an API
- Adding a new todo via a form
- Toggling a todo's completion status
- Deleting a todo
- Filtering todos by status (all, active, completed)

Write tests at three levels:
1. **Unit tests** for the utility functions (filtering logic)
2. **Integration tests** for the full TodoList component with mocked API
3. **E2E test** for the end-to-end workflow using Playwright

### Starter Code: The Feature

```javascript
// utils/filterTodos.js
export function filterTodos(todos, filter) {
  switch (filter) {
    case 'active':
      return todos.filter(todo => !todo.completed);
    case 'completed':
      return todos.filter(todo => todo.completed);
    case 'all':
    default:
      return todos;
  }
}
```

```javascript
// components/TodoList.js
import { useState, useEffect } from 'react';
import { filterTodos } from '../utils/filterTodos';

export function TodoList() {
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState('all');
  const [newTodoText, setNewTodoText] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/todos', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load todos');
        return res.json();
      })
      .then(data => {
        setTodos(data);
        setIsLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  async function handleAddTodo(event) {
    event.preventDefault();
    if (!newTodoText.trim()) return;

    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newTodoText, completed: false }),
      });
      if (!response.ok) throw new Error('Failed to add todo');
      const newTodo = await response.json();
      setTodos(prev => [...prev, newTodo]);
      setNewTodoText('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(todoId) {
    const todo = todos.find(t => t.id === todoId);
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!response.ok) throw new Error('Failed to update todo');
      const updated = await response.json();
      setTodos(prev => prev.map(t => (t.id === todoId ? updated : t)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(todoId) {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete todo');
      setTodos(prev => prev.filter(t => t.id !== todoId));
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) return <p>Loading todos...</p>;

  const visibleTodos = filterTodos(todos, filter);

  return (
    <div>
      <h1>Todo List</h1>

      {error && <div role="alert">{error}</div>}

      <form onSubmit={handleAddTodo}>
        <label htmlFor="new-todo">New Todo</label>
        <input
          id="new-todo"
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <div role="group" aria-label="Filter todos">
        {['all', 'active', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {visibleTodos.length === 0 ? (
        <p>No todos to display.</p>
      ) : (
        <ul aria-label="Todo items">
          {visibleTodos.map(todo => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => handleToggle(todo.id)}
                />
                <span style={{
                  textDecoration: todo.completed ? 'line-through' : 'none'
                }}>
                  {todo.text}
                </span>
              </label>
              <button
                onClick={() => handleDelete(todo.id)}
                aria-label={`Delete ${todo.text}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Solution: Unit Tests

```javascript
// utils/filterTodos.test.js
import { filterTodos } from './filterTodos';

const mockTodos = [
  { id: 1, text: 'Buy groceries', completed: false },
  { id: 2, text: 'Clean house', completed: true },
  { id: 3, text: 'Write tests', completed: false },
  { id: 4, text: 'Ship feature', completed: true },
];

describe('filterTodos', () => {
  test('returns all todos when filter is "all"', () => {
    const result = filterTodos(mockTodos, 'all');
    expect(result).toHaveLength(4);
    expect(result).toEqual(mockTodos);
  });

  test('returns only active (incomplete) todos when filter is "active"', () => {
    const result = filterTodos(mockTodos, 'active');
    expect(result).toHaveLength(2);
    expect(result.every(t => !t.completed)).toBe(true);
    expect(result[0].text).toBe('Buy groceries');
    expect(result[1].text).toBe('Write tests');
  });

  test('returns only completed todos when filter is "completed"', () => {
    const result = filterTodos(mockTodos, 'completed');
    expect(result).toHaveLength(2);
    expect(result.every(t => t.completed)).toBe(true);
  });

  test('returns all todos for an unknown filter value', () => {
    // The default case in the switch handles unknown filters
    // by returning the full list.
    const result = filterTodos(mockTodos, 'invalid');
    expect(result).toHaveLength(4);
  });

  test('returns an empty array when the input is empty', () => {
    expect(filterTodos([], 'all')).toEqual([]);
    expect(filterTodos([], 'active')).toEqual([]);
    expect(filterTodos([], 'completed')).toEqual([]);
  });
});
```

### Solution: MSW Handlers

```javascript
// src/test/todoHandlers.js
import { http, HttpResponse } from 'msw';

// In-memory store for test isolation.
// Each test resets handlers via server.resetHandlers().
let todosDb = [
  { id: 1, text: 'Buy groceries', completed: false },
  { id: 2, text: 'Clean house', completed: true },
  { id: 3, text: 'Write tests', completed: false },
];

let nextId = 4;

export const todoHandlers = [
  // GET all todos
  http.get('/api/todos', () => {
    return HttpResponse.json(todosDb);
  }),

  // POST a new todo
  http.post('/api/todos', async ({ request }) => {
    const body = await request.json();
    const newTodo = { id: nextId++, ...body };
    todosDb.push(newTodo);
    return HttpResponse.json(newTodo, { status: 201 });
  }),

  // PATCH (toggle) a todo
  http.patch('/api/todos/:id', async ({ params, request }) => {
    const body = await request.json();
    const todo = todosDb.find(t => t.id === Number(params.id));
    if (!todo) {
      return new HttpResponse(null, { status: 404 });
    }
    Object.assign(todo, body);
    return HttpResponse.json(todo);
  }),

  // DELETE a todo
  http.delete('/api/todos/:id', ({ params }) => {
    const index = todosDb.findIndex(t => t.id === Number(params.id));
    if (index === -1) {
      return new HttpResponse(null, { status: 404 });
    }
    todosDb.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
```

### Solution: Integration Tests

```javascript
// components/TodoList.test.js
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { todoHandlers } from '../test/todoHandlers';
import { TodoList } from './TodoList';

// Register todo handlers for this test file
beforeEach(() => {
  server.use(...todoHandlers);
});

test('loads and displays the initial list of todos', async () => {
  render(<TodoList />);

  // Loading state appears first
  expect(screen.getByText('Loading todos...')).toBeInTheDocument();

  // Todos appear after the API responds
  expect(await screen.findByText('Buy groceries')).toBeInTheDocument();
  expect(screen.getByText('Clean house')).toBeInTheDocument();
  expect(screen.getByText('Write tests')).toBeInTheDocument();
});

test('adds a new todo when the form is submitted', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  // Wait for initial load
  await screen.findByText('Buy groceries');

  // Type a new todo and submit
  await user.type(screen.getByLabelText('New Todo'), 'Deploy to production');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  // The new todo appears in the list
  expect(await screen.findByText('Deploy to production')).toBeInTheDocument();

  // The input is cleared after submission
  expect(screen.getByLabelText('New Todo')).toHaveValue('');
});

test('does not add an empty todo', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // Submit with empty input
  await user.click(screen.getByRole('button', { name: 'Add' }));

  // The list should still have only the original three items
  const list = screen.getByRole('list', { name: 'Todo items' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
});

test('toggles a todo between completed and active', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // "Buy groceries" is initially unchecked
  const checkbox = screen.getByRole('checkbox', { name: /Buy groceries/i });
  expect(checkbox).not.toBeChecked();

  // Toggle it to completed
  await user.click(checkbox);

  // After the API responds, the checkbox should be checked
  await screen.findByRole('checkbox', { name: /Buy groceries/i, checked: true });
});

test('deletes a todo from the list', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // Delete "Clean house"
  await user.click(screen.getByRole('button', { name: 'Delete Clean house' }));

  // "Clean house" should no longer be in the document
  // Use waitFor because the deletion is async
  expect(screen.queryByText('Clean house')).not.toBeInTheDocument();

  // Other todos remain
  expect(screen.getByText('Buy groceries')).toBeInTheDocument();
  expect(screen.getByText('Write tests')).toBeInTheDocument();
});

test('filters todos by active status', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // Click the "Active" filter
  await user.click(screen.getByRole('button', { name: 'Active' }));

  // Only incomplete todos are visible
  expect(screen.getByText('Buy groceries')).toBeInTheDocument();
  expect(screen.getByText('Write tests')).toBeInTheDocument();
  expect(screen.queryByText('Clean house')).not.toBeInTheDocument();
});

test('filters todos by completed status', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // Click the "Completed" filter
  await user.click(screen.getByRole('button', { name: 'Completed' }));

  // Only completed todos are visible
  expect(screen.getByText('Clean house')).toBeInTheDocument();
  expect(screen.queryByText('Buy groceries')).not.toBeInTheDocument();
  expect(screen.queryByText('Write tests')).not.toBeInTheDocument();
});

test('shows an empty state when no todos match the filter', async () => {
  // Override handler to return no completed todos
  server.use(
    http.get('/api/todos', () => {
      return HttpResponse.json([
        { id: 1, text: 'Active todo', completed: false },
      ]);
    })
  );

  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Active todo');

  // Filter by completed: no matches
  await user.click(screen.getByRole('button', { name: 'Completed' }));

  expect(screen.getByText('No todos to display.')).toBeInTheDocument();
});

test('shows an error when the API fails to load todos', async () => {
  server.use(
    http.get('/api/todos', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  render(<TodoList />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to load todos'
  );
});

test('shows an error when adding a todo fails', async () => {
  const user = userEvent.setup();
  render(<TodoList />);

  await screen.findByText('Buy groceries');

  // Override the POST handler to fail
  server.use(
    http.post('/api/todos', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  await user.type(screen.getByLabelText('New Todo'), 'Failing todo');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to add todo'
  );
});
```

### Solution: E2E Test (Playwright)

```javascript
// e2e/todo.spec.js
import { test, expect } from '@playwright/test';

test.describe('Todo List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/todos');
    // Wait for the todo list to load
    await expect(page.getByRole('list', { name: 'Todo items' })).toBeVisible();
  });

  test('full workflow: add, toggle, filter, and delete a todo', async ({ page }) => {
    // Add a new todo
    await page.getByLabel('New Todo').fill('Write E2E tests');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Write E2E tests')).toBeVisible();

    // Toggle it to completed
    const newTodoCheckbox = page.getByRole('checkbox', {
      name: /Write E2E tests/i,
    });
    await newTodoCheckbox.check();
    await expect(newTodoCheckbox).toBeChecked();

    // Filter by "Active": the completed todo should disappear
    await page.getByRole('button', { name: 'Active' }).click();
    await expect(page.getByText('Write E2E tests')).not.toBeVisible();

    // Filter by "Completed": the todo reappears
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.getByText('Write E2E tests')).toBeVisible();

    // Switch back to "All" and delete the todo
    await page.getByRole('button', { name: 'All' }).click();
    await page.getByRole('button', { name: 'Delete Write E2E tests' }).click();
    await expect(page.getByText('Write E2E tests')).not.toBeVisible();
  });
});
```

### Key Takeaway

A complete test suite operates at multiple levels. Unit tests cover isolated logic (the `filterTodos` function) with exhaustive edge cases and run in milliseconds. Integration tests cover the feature as a user experiences it, rendering the full component with mocked API calls, and verify all user flows: loading, adding, toggling, deleting, filtering, and error handling. E2E tests verify the full workflow in a real browser against the real application. Together, these layers provide high confidence with manageable maintenance cost. The unit tests are cheap to write and run; the integration tests provide the most confidence per test; the E2E test catches issues that only appear in a real browser environment.

---

## Chapter Summary

A senior-level testing strategy allocates effort according to the Testing Trophy: a foundation of static analysis, a moderate layer of unit tests, a large layer of integration tests, and a thin layer of end-to-end tests. React Testing Library enforces the principle of testing behavior over implementation by providing accessibility-first queries and user-event simulations. Vitest offers a fast, modern test runner that integrates seamlessly with Vite-based React projects. MSW v2 mocks API calls at the network level, keeping application code realistic during tests. Playwright handles end-to-end testing with auto-waiting locators, page object models, and CI-friendly features like trace capture and sharding. Coverage metrics serve as a floor for discipline, not a target for inflation.

## Further Reading

- [Testing Library Official Documentation](https://testing-library.com/docs/)
- [Kent C. Dodds: Common Mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Kent C. Dodds: The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Kent C. Dodds: How to Test Custom React Hooks](https://kentcdodds.com/blog/how-to-test-custom-react-hooks)
- [Vitest Documentation](https://vitest.dev/)
- [Mock Service Worker (MSW) Documentation](https://mswjs.io/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Chromatic Visual Testing](https://www.chromatic.com/docs/)
