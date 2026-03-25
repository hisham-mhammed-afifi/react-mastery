# Part 4, Chapter 4: State Machines & Complex UI Logic

## What You Will Learn

- Explain why finite state machines prevent impossible states and eliminate the "boolean explosion" problem in complex UI logic
- Implement state machine patterns using `useReducer` with explicit state transition graphs
- Define XState v5 machines with states, events, transitions, guards, context, and actions
- Model multi-step forms, authentication flows, and wizard interfaces as formal state machines
- Construct statecharts with hierarchical (nested) and parallel (orthogonal) states for complex independent concerns
- Connect state machines to React components using `@xstate/react` hooks and the `createActorContext` pattern
- Build a complete checkout flow as a state machine with guards, context accumulation, and side effects

---

## 4.1 Why State Machines for UI

User interfaces are inherently stateful. A form can be idle, validating, submitting, or displaying a success message. A media player can be playing, paused, buffered, or errored. A modal can be open, closing with an animation, or closed. Every interactive element in a UI occupies one of a finite number of states at any given moment, and transitions between those states follow predictable rules.

The problem is that most React code does not model state this way.

### The Boolean Explosion Problem

The most common approach to managing UI state is to declare independent boolean flags for each concern:

```javascript
function DataLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function fetchData() {
    setIsLoading(true);
    setIsError(false);
    setIsSuccess(false);
    setError(null);

    try {
      const response = await fetch("/api/data");
      const result = await response.json();
      setData(result);
      setIsSuccess(true);
    } catch (err) {
      setError(err.message);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }

  // What happens if isLoading AND isSuccess are both true?
  // What happens if isError AND isSuccess are both true?
  // The code above tries to prevent this, but nothing enforces it.
}
```

Three boolean flags produce 2^3 = 8 possible combinations. Of those eight states, only four are valid: idle (nothing true), loading (only `isLoading` true), success (only `isSuccess` true), and error (only `isError` true). The remaining four combinations are impossible states that the code allows but the UI cannot meaningfully represent.

Every boolean added doubles the number of possible states. Four booleans yield 16 combinations. Five yield 32. Most of those combinations are nonsensical, yet every conditional branch in the rendering logic must account for or ignore them. This is the boolean explosion.

### Enumerate, Don't Booleanate

The solution is to replace independent booleans with an enumerated status value:

```javascript
function DataLoader() {
  const [status, setStatus] = useState("idle"); // "idle" | "loading" | "success" | "error"
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function fetchData() {
    setStatus("loading");

    try {
      const response = await fetch("/api/data");
      const result = await response.json();
      setData(result);
      setStatus("success");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  // Exactly one status at a time. No impossible combinations.
  if (status === "loading") return <Spinner />;
  if (status === "error") return <ErrorMessage message={error} />;
  if (status === "success") return <DataTable rows={data} />;
  return <button onClick={fetchData}>Load Data</button>;
}
```

This is an improvement, but it still has a problem: nothing prevents calling `setStatus("success")` from the "idle" state, or `setStatus("loading")` from the "success" state. The transitions are implicit. A state machine makes them explicit.

### What a State Machine Is

A finite state machine (FSM) is a mathematical model consisting of:

1. **A finite set of states** (idle, loading, success, error)
2. **A finite set of events** (FETCH, RESOLVE, REJECT, RETRY)
3. **A transition function** that maps (current state, event) to the next state
4. **An initial state** (idle)
5. **A set of final states** (optional; states that represent completion)

The transition function is the critical piece. It defines which events are valid in which states, and what state each event leads to. Any event not defined for the current state is simply ignored.

```
State Transition Table:
+----------+---------+----------+---------+--------+
| State    | FETCH   | RESOLVE  | REJECT  | RETRY  |
+----------+---------+----------+---------+--------+
| idle     | loading |    -     |    -    |   -    |
| loading  |    -    | success  |  error  |   -    |
| success  |    -    |    -     |    -    |   -    |
| error    |    -    |    -     |    -    | loading|
+----------+---------+----------+---------+--------+
```

Reading this table, the rules are unambiguous: from "idle," only `FETCH` is valid. From "loading," only `RESOLVE` and `REJECT` are valid. From "error," only `RETRY` is valid. There is no path from "idle" to "success" without passing through "loading." Impossible transitions are not merely unlikely; they are structurally excluded.

> **Common Mistake:** Developers often avoid state machines because they seem "over-engineered" for a simple loading indicator. The real cost, however, appears months later when a bug report arrives: "The UI briefly shows both a spinner and an error message." That bug exists because independent booleans allowed a state combination that a state machine would have prevented from the start. State machines are not about complexity; they are about correctness.

### When to Use State Machines

State machines are most valuable when:

- **Multiple states interact**: authentication flows, multi-step forms, checkout processes
- **Invalid states cause bugs**: any situation where two pieces of state should never be true simultaneously
- **State transitions have side effects**: API calls, navigation, analytics events tied to specific transitions
- **The flow must be documented**: state machines produce diagrams that serve as living documentation
- **Multiple developers work on the same flow**: explicit transitions prevent one developer from introducing a transition path another did not anticipate

State machines are unnecessary when:

- A component has a single boolean toggle (open/closed modal)
- State is derived from props or other state
- The state is server-cached data managed by TanStack Query or SWR

> **See Also:** Part 3, Chapter 4, Section 4.3 for derived state patterns, and Part 3, Chapter 5 for data fetching libraries that handle loading/error/success states internally.

---

## 4.2 useReducer as a Simple State Machine

React's `useReducer` hook accepts a reducer function with the signature `(state, action) => newState`. This is structurally identical to a state machine's transition function: given the current state and an event, return the next state. The key difference between an ordinary reducer and a state machine reducer is whether the reducer constrains transitions based on the current state.

### A Standard Reducer (Not a State Machine)

A typical reducer processes actions regardless of the current state:

```javascript
function formReducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: true, error: null };
    case "SET_SUCCESS":
      return { ...state, isLoading: false, data: action.payload };
    case "SET_ERROR":
      return { ...state, isLoading: false, error: action.error };
    default:
      return state;
  }
}
```

This reducer will happily process `SET_SUCCESS` even if `isLoading` is `false`. It does not enforce any ordering or valid transition paths. It is a state updater, not a state machine.

### The State Transition Graph Pattern

To turn `useReducer` into a state machine, define a transition graph that maps each state to its valid events and their target states:

```javascript
const TRANSITIONS = {
  idle: {
    FETCH: "loading",
  },
  loading: {
    RESOLVE: "success",
    REJECT: "error",
  },
  success: {
    RESET: "idle",
  },
  error: {
    RETRY: "loading",
  },
};

function statusReducer(status, event) {
  const nextStatus = TRANSITIONS[status]?.[event];
  return nextStatus ?? status;
}

function DataFetcher() {
  const [status, send] = useReducer(statusReducer, "idle");

  // Attempting to send "RESOLVE" while in "idle" state does nothing.
  // The transition graph simply does not define that path.

  return (
    <div>
      {status === "idle" && (
        <button onClick={() => send("FETCH")}>Load</button>
      )}
      {status === "loading" && <Spinner />}
      {status === "success" && <p>Data loaded.</p>}
      {status === "error" && (
        <button onClick={() => send("RETRY")}>Retry</button>
      )}
    </div>
  );
}
```

The `statusReducer` checks whether the current status has a defined transition for the incoming event. If not, it returns the current status unchanged. This is the fundamental behavior of a state machine: undefined transitions are silently ignored.

### Adding Context to the State Machine

A pure finite state machine tracks only which state is active. Real applications also need associated data: the fetched response, the error message, the form values accumulated across steps. This combination of finite state (the status) and extended state (the data) is sometimes called a "statechart with context."

```javascript
const TRANSITIONS = {
  idle: {
    FETCH: "loading",
  },
  loading: {
    RESOLVE: "success",
    REJECT: "error",
  },
  success: {
    FETCH: "loading",
  },
  error: {
    RETRY: "loading",
  },
};

function fetchReducer(state, event) {
  const nextStatus = TRANSITIONS[state.status]?.[event.type];

  if (!nextStatus) return state;

  switch (nextStatus) {
    case "loading":
      return { status: "loading", data: null, error: null };
    case "success":
      return { status: "success", data: event.payload, error: null };
    case "error":
      return { status: "error", data: null, error: event.error };
    default:
      return { ...state, status: nextStatus };
  }
}

function UserProfile({ userId }) {
  const [state, send] = useReducer(fetchReducer, {
    status: "idle",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    send({ type: "FETCH" });

    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => send({ type: "RESOLVE", payload: data }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          send({ type: "REJECT", error: err.message });
        }
      });

    return () => controller.abort();
  }, [userId]);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") return <ErrorBanner message={state.error} />;
  if (state.status === "success") return <ProfileCard user={state.data} />;
  return null;
}
```

The reducer first checks the transition graph. If no transition exists for the current status and event type, the state is returned unchanged. If a valid transition exists, the reducer constructs the new state with both the next status and the appropriate associated data.

### Adding Guards

Guards are conditions that must be true for a transition to proceed. They add an extra layer of validation beyond "is this event valid in this state?"

```javascript
const TRANSITIONS = {
  editing: {
    SUBMIT: {
      target: "submitting",
      guard: (state) => state.formData.email.includes("@"),
    },
    VALIDATE: {
      target: "validating",
    },
  },
  validating: {
    VALID: { target: "submitting" },
    INVALID: { target: "editing" },
  },
  submitting: {
    SUCCESS: { target: "success" },
    FAILURE: { target: "editing" },
  },
  success: {},
};

function formReducer(state, event) {
  const transition = TRANSITIONS[state.status]?.[event.type];

  if (!transition) return state;

  // If transition is a string, no guard; if object, check guard
  const target = typeof transition === "string" ? transition : transition.target;
  const guard = typeof transition === "object" ? transition.guard : null;

  if (guard && !guard(state)) return state;

  switch (target) {
    case "submitting":
      return { ...state, status: "submitting" };
    case "validating":
      return { ...state, status: "validating", errors: {} };
    case "editing":
      return {
        ...state,
        status: "editing",
        errors: event.errors ?? state.errors,
      };
    case "success":
      return { ...state, status: "success" };
    default:
      return { ...state, status: target };
  }
}
```

> **Common Mistake:** Developers often implement guards as `if` checks scattered throughout event handlers rather than co-locating them with the transition definition. When guards live inside the transition graph, they become part of the machine's specification. When they live in component code, they are disconnected from the state model and easy to bypass or forget.

### When useReducer Is Enough

The `useReducer` state machine pattern works well when:

- The machine is used within a single component or a small component subtree
- There are no side effects tied to transitions (or you manage side effects in `useEffect`)
- There are no hierarchical or parallel states
- You want zero additional dependencies

When the machine requires nested states, parallel regions, automatically invoked side effects on transitions, or formal visualization, a dedicated library like XState provides the necessary abstractions.

---

## 4.3 XState Fundamentals: States, Events, Transitions, Guards

XState is a JavaScript library that implements statecharts, an extended formalism of finite state machines introduced by David Harel in 1987. XState v5, released in December 2023, is the current stable version. It shifts the primary abstraction from machines to actors, though state machines remain the core building block.

### Installation

```bash
npm install xstate @xstate/react
```

### Creating a Machine

The `createMachine` function defines a state machine:

```javascript
import { createMachine } from "xstate";

const toggleMachine = createMachine({
  id: "toggle",
  initial: "inactive",
  states: {
    inactive: {
      on: {
        TOGGLE: { target: "active" },
      },
    },
    active: {
      on: {
        TOGGLE: { target: "inactive" },
      },
    },
  },
});
```

The machine definition is a plain JavaScript object. The `id` uniquely identifies the machine. The `initial` property declares the starting state. The `states` object defines every possible state, and the `on` property within each state defines which events trigger transitions and where they lead.

### The setup() API

XState v5 introduced the `setup()` function for declaring reusable actions, guards, and actors before creating the machine. This approach separates the machine's type definitions and implementations from its structural definition:

```javascript
import { setup, assign } from "xstate";

const counterMachine = setup({
  actions: {
    increment: assign({
      count: ({ context }) => context.count + 1,
    }),
    decrement: assign({
      count: ({ context }) => context.count - 1,
    }),
    resetCount: assign({
      count: 0,
    }),
  },
  guards: {
    isPositive: ({ context }) => context.count > 0,
    isUnderLimit: ({ context }) => context.count < 10,
  },
}).createMachine({
  id: "counter",
  initial: "active",
  context: {
    count: 0,
  },
  states: {
    active: {
      on: {
        INCREMENT: {
          guard: "isUnderLimit",
          actions: "increment",
        },
        DECREMENT: {
          guard: "isPositive",
          actions: "decrement",
        },
        RESET: {
          actions: "resetCount",
        },
      },
    },
  },
});
```

The `setup()` approach has two benefits. First, actions and guards are named strings in the machine definition, making the structure readable as a specification. Second, implementations can be overridden using `machine.provide()` at the point of use, which is essential for testing and for reusing machines across different contexts.

### Context: Extended State

While the finite states (idle, loading, success) represent the qualitative mode of the machine, context holds the quantitative data: counts, form values, fetched results, error messages.

```javascript
import { setup, assign } from "xstate";

const searchMachine = setup({
  actions: {
    setQuery: assign({
      query: ({ event }) => event.value,
    }),
    setResults: assign({
      results: ({ event }) => event.output,
      error: null,
    }),
    setError: assign({
      error: ({ event }) => event.error,
      results: [],
    }),
    clearResults: assign({
      results: [],
      error: null,
    }),
  },
}).createMachine({
  id: "search",
  initial: "idle",
  context: {
    query: "",
    results: [],
    error: null,
  },
  states: {
    idle: {
      on: {
        TYPE: {
          actions: "setQuery",
          target: "debouncing",
        },
      },
    },
    debouncing: {
      on: {
        TYPE: {
          actions: "setQuery",
          target: "debouncing",
        },
      },
      after: {
        300: "searching",
      },
    },
    searching: {
      on: {
        TYPE: {
          actions: "setQuery",
          target: "debouncing",
        },
      },
      invoke: {
        src: "searchApi",
        input: ({ context }) => ({ query: context.query }),
        onDone: {
          target: "idle",
          actions: "setResults",
        },
        onError: {
          target: "idle",
          actions: "setError",
        },
      },
    },
  },
});
```

The `assign` function is XState's mechanism for updating context. It receives an object whose keys correspond to context properties. Each value is either a static value or a function that receives `{ context, event }` and returns the new value for that property.

### Events

In XState v5, events must be objects with a `type` property. String-only events are no longer supported:

```javascript
// Sending events to an actor
actorRef.send({ type: "TYPE", value: "react hooks" });
actorRef.send({ type: "SUBMIT" });
actorRef.send({ type: "SELECT_ITEM", itemId: 42, quantity: 2 });
```

Event objects can carry any additional payload alongside `type`. The machine accesses this payload through the `event` parameter in actions, guards, and other callbacks.

### Transitions

A transition defines the path from one state to another in response to an event. Transitions in XState v5 are internal by default, meaning they do not re-enter the current state. To force re-entry (re-triggering entry actions), set `reenter: true`:

```javascript
const machine = createMachine({
  initial: "active",
  states: {
    active: {
      entry: () => console.log("Entered active state"),
      on: {
        // Internal transition: does NOT re-trigger entry action
        REFRESH: { actions: "refreshData" },
        // External transition: re-triggers entry action
        HARD_REFRESH: { target: "active", reenter: true },
      },
    },
  },
});
```

### Guards

Guards are conditions evaluated before a transition proceeds. If the guard returns `false`, the transition is blocked and the machine remains in its current state:

```javascript
import { setup, assign } from "xstate";

const withdrawalMachine = setup({
  guards: {
    hasSufficientFunds: ({ context, event }) => {
      return context.balance >= event.amount;
    },
    isValidAmount: ({ event }) => {
      return event.amount > 0 && Number.isFinite(event.amount);
    },
  },
  actions: {
    deductAmount: assign({
      balance: ({ context, event }) => context.balance - event.amount,
    }),
    recordInsufficientFunds: assign({
      lastError: "Insufficient funds",
    }),
  },
}).createMachine({
  id: "withdrawal",
  initial: "ready",
  context: {
    balance: 1000,
    lastError: null,
  },
  states: {
    ready: {
      on: {
        WITHDRAW: [
          {
            guard: "isValidAmount",
            actions: "deductAmount",
            target: "ready",
            reenter: true,
          },
          {
            // Fallback when guard fails
            actions: "recordInsufficientFunds",
          },
        ],
      },
    },
  },
});
```

When multiple transitions share the same event, XState evaluates them in array order. The first transition whose guard passes (or that has no guard) is taken. This allows fallback transitions for when guards fail.

XState v5 also provides higher-order guards for composing conditions:

```javascript
import { and, or, not } from "xstate";

const machine = setup({
  guards: {
    isAuthenticated: ({ context }) => !!context.user,
    hasPermission: ({ context }) => context.user?.role === "admin",
    isVerified: ({ context }) => context.user?.emailVerified === true,
  },
}).createMachine({
  // ...
  states: {
    dashboard: {
      on: {
        ACCESS_ADMIN: {
          guard: and(["isAuthenticated", "hasPermission", "isVerified"]),
          target: "adminPanel",
        },
        ACCESS_SETTINGS: {
          guard: or(["hasPermission", "isVerified"]),
          target: "settings",
        },
        LOGOUT: {
          guard: not("isAuthenticated"),
          target: "login",
        },
      },
    },
  },
});
```

### Invoking Asynchronous Logic

XState v5 provides actor logic creators for handling side effects. The most common is `fromPromise`, which wraps an async function as an invokable actor:

```javascript
import { setup, assign, fromPromise } from "xstate";

const userMachine = setup({
  actors: {
    fetchUser: fromPromise(async ({ input }) => {
      const response = await fetch(`/api/users/${input.userId}`);
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    }),
  },
  actions: {
    assignUser: assign({
      user: ({ event }) => event.output,
    }),
    assignError: assign({
      error: ({ event }) => event.error.message,
    }),
  },
}).createMachine({
  id: "user",
  initial: "idle",
  context: {
    userId: null,
    user: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        LOAD: {
          target: "loading",
          actions: assign({ userId: ({ event }) => event.userId }),
        },
      },
    },
    loading: {
      invoke: {
        src: "fetchUser",
        input: ({ context }) => ({ userId: context.userId }),
        onDone: {
          target: "loaded",
          actions: "assignUser",
        },
        onError: {
          target: "error",
          actions: "assignError",
        },
      },
    },
    loaded: {
      on: {
        RELOAD: "loading",
      },
    },
    error: {
      on: {
        RETRY: "loading",
      },
    },
  },
});
```

The `invoke` property declares that when the machine enters the "loading" state, it should start the "fetchUser" actor. The `input` function passes data from the machine's context to the actor. When the promise resolves, `onDone` fires with the resolved value in `event.output`. When it rejects, `onError` fires with the error in `event.error`.

XState v5 also provides other actor logic creators:

- `fromCallback`: for event listeners and subscriptions
- `fromObservable`: for RxJS-style observable streams
- `fromTransition`: for reducer-style logic

```javascript
import { fromCallback } from "xstate";

const resizeObserverActor = fromCallback(({ sendBack }) => {
  const handleResize = () => {
    sendBack({
      type: "RESIZE",
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
});
```

### Actions

Actions are fire-and-forget side effects that execute during transitions or on state entry/exit:

```javascript
const notificationMachine = setup({
  actions: {
    logEntry: ({ context }) => {
      console.log("Notification shown:", context.message);
    },
    startAutoDismissTimer: ({ context, self }) => {
      setTimeout(() => {
        self.send({ type: "DISMISS" });
      }, context.duration);
    },
    logDismissal: () => {
      console.log("Notification dismissed");
    },
    trackAnalytics: ({ context }) => {
      analytics.track("notification_shown", { type: context.type });
    },
  },
}).createMachine({
  id: "notification",
  initial: "hidden",
  context: {
    message: "",
    type: "info",
    duration: 5000,
  },
  states: {
    hidden: {
      on: {
        SHOW: {
          target: "visible",
          actions: assign({
            message: ({ event }) => event.message,
            type: ({ event }) => event.type ?? "info",
          }),
        },
      },
    },
    visible: {
      entry: ["logEntry", "startAutoDismissTimer", "trackAnalytics"],
      exit: "logDismissal",
      on: {
        DISMISS: "hidden",
        SHOW: {
          target: "visible",
          reenter: true,
          actions: assign({
            message: ({ event }) => event.message,
            type: ({ event }) => event.type ?? "info",
          }),
        },
      },
    },
  },
});
```

Entry actions execute when a state is entered. Exit actions execute when a state is exited. Transition actions (specified in the `on` handler) execute during the transition itself. The execution order is: exit actions of the source state, transition actions, then entry actions of the target state.

---

## 4.4 Modeling Complex Flows: Multi-Step Forms, Authentication, Wizards

State machines excel when modeling flows that have multiple sequential stages, conditional branching, and the possibility of moving backward or restarting. These flows are notoriously difficult to manage with independent `useState` calls because the valid transitions depend on the current step, accumulated data, and validation results.

### Multi-Step Form

A multi-step form collects data across several screens. The machine tracks which step is active, accumulates form data in context, and uses guards to enforce validation before allowing progression:

```javascript
import { setup, assign } from "xstate";

const multiStepFormMachine = setup({
  guards: {
    isPersonalInfoValid: ({ context }) => {
      const { firstName, lastName, email } = context.formData;
      return (
        firstName.trim().length > 0 &&
        lastName.trim().length > 0 &&
        email.includes("@")
      );
    },
    isAddressValid: ({ context }) => {
      const { street, city, zipCode } = context.formData;
      return (
        street.trim().length > 0 &&
        city.trim().length > 0 &&
        /^\d{5}(-\d{4})?$/.test(zipCode)
      );
    },
    isPaymentValid: ({ context }) => {
      const { cardNumber, expiryDate } = context.formData;
      return cardNumber.replace(/\s/g, "").length === 16 && expiryDate.length === 5;
    },
  },
  actions: {
    updateFormData: assign({
      formData: ({ context, event }) => ({
        ...context.formData,
        ...event.data,
      }),
    }),
    clearErrors: assign({ errors: {} }),
    setValidationErrors: assign({
      errors: ({ event }) => event.errors,
    }),
  },
}).createMachine({
  id: "multiStepForm",
  initial: "personalInfo",
  context: {
    formData: {
      firstName: "",
      lastName: "",
      email: "",
      street: "",
      city: "",
      zipCode: "",
      cardNumber: "",
      expiryDate: "",
      cvv: "",
    },
    errors: {},
    currentStep: 0,
  },
  states: {
    personalInfo: {
      entry: assign({ currentStep: 0 }),
      on: {
        UPDATE_FIELD: { actions: "updateFormData" },
        NEXT: [
          {
            guard: "isPersonalInfoValid",
            target: "address",
            actions: "clearErrors",
          },
          {
            actions: "setValidationErrors",
          },
        ],
      },
    },
    address: {
      entry: assign({ currentStep: 1 }),
      on: {
        UPDATE_FIELD: { actions: "updateFormData" },
        BACK: "personalInfo",
        NEXT: [
          {
            guard: "isAddressValid",
            target: "payment",
            actions: "clearErrors",
          },
          {
            actions: "setValidationErrors",
          },
        ],
      },
    },
    payment: {
      entry: assign({ currentStep: 2 }),
      on: {
        UPDATE_FIELD: { actions: "updateFormData" },
        BACK: "address",
        NEXT: [
          {
            guard: "isPaymentValid",
            target: "review",
            actions: "clearErrors",
          },
          {
            actions: "setValidationErrors",
          },
        ],
      },
    },
    review: {
      entry: assign({ currentStep: 3 }),
      on: {
        BACK: "payment",
        SUBMIT: "submitting",
        EDIT_PERSONAL: "personalInfo",
        EDIT_ADDRESS: "address",
        EDIT_PAYMENT: "payment",
      },
    },
    submitting: {
      invoke: {
        src: "submitForm",
        input: ({ context }) => ({ formData: context.formData }),
        onDone: "success",
        onError: {
          target: "review",
          actions: assign({
            errors: ({ event }) => ({ submit: event.error.message }),
          }),
        },
      },
    },
    success: {
      type: "final",
    },
  },
});
```

Several design decisions in this machine are worth noting. The `NEXT` event uses an array of transitions with guards: if validation passes, the machine advances; otherwise, the fallback transition sets error messages without changing state. The "review" state allows jumping back to any previous step via specific edit events. The "submitting" state invokes an async actor and handles both success and failure. Each step sets `currentStep` in context on entry, enabling a progress indicator in the UI.

### Authentication Flow

Authentication involves checking for an existing session, signing in, signing up, handling errors, and managing the authenticated session. The hierarchical nature of this flow maps naturally to nested states:

```javascript
import { setup, assign, fromPromise } from "xstate";

const authMachine = setup({
  actors: {
    checkSession: fromPromise(async () => {
      const response = await fetch("/api/auth/session");
      if (!response.ok) throw new Error("No session");
      return response.json();
    }),
    signIn: fromPromise(async ({ input }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.credentials),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    }),
    signOut: fromPromise(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    }),
  },
  actions: {
    assignUser: assign({
      user: ({ event }) => event.output.user,
      error: null,
    }),
    assignError: assign({
      error: ({ event }) => event.error.message,
    }),
    clearUser: assign({
      user: null,
      error: null,
    }),
    clearError: assign({ error: null }),
  },
  guards: {
    hasCredentials: ({ event }) => {
      return event.email?.trim().length > 0 && event.password?.length >= 8;
    },
  },
}).createMachine({
  id: "auth",
  initial: "checkingSession",
  context: {
    user: null,
    error: null,
  },
  states: {
    checkingSession: {
      invoke: {
        src: "checkSession",
        onDone: {
          target: "authenticated",
          actions: "assignUser",
        },
        onError: "unauthenticated",
      },
    },
    unauthenticated: {
      initial: "signInForm",
      states: {
        signInForm: {
          on: {
            SUBMIT_SIGN_IN: {
              guard: "hasCredentials",
              target: "signingIn",
            },
            GO_TO_SIGN_UP: "signUpForm",
          },
        },
        signUpForm: {
          on: {
            SUBMIT_SIGN_UP: "signingUp",
            GO_TO_SIGN_IN: "signInForm",
          },
        },
        signingIn: {
          invoke: {
            src: "signIn",
            input: ({ event }) => ({ credentials: event }),
            onDone: {
              target: "#auth.authenticated",
              actions: "assignUser",
            },
            onError: {
              target: "signInForm",
              actions: "assignError",
            },
          },
        },
        signingUp: {
          invoke: {
            src: "signIn",
            input: ({ event }) => ({ credentials: event }),
            onDone: {
              target: "#auth.authenticated",
              actions: "assignUser",
            },
            onError: {
              target: "signUpForm",
              actions: "assignError",
            },
          },
        },
      },
    },
    authenticated: {
      on: {
        SIGN_OUT: "signingOut",
      },
    },
    signingOut: {
      invoke: {
        src: "signOut",
        onDone: {
          target: "unauthenticated",
          actions: "clearUser",
        },
        onError: {
          target: "authenticated",
          actions: "assignError",
        },
      },
    },
  },
});
```

The `#auth.authenticated` syntax is a state ID reference. Because "signingIn" is a nested state within "unauthenticated," a simple target string like `"authenticated"` would resolve relative to "unauthenticated" and fail. The `#` prefix references the machine's root level using the machine's `id`.

### Wizard Pattern

A wizard is similar to a multi-step form but often includes conditional step ordering, where the sequence of steps depends on earlier answers:

```javascript
import { setup, assign } from "xstate";

const onboardingWizard = setup({
  guards: {
    isBusinessAccount: ({ context }) =>
      context.accountType === "business",
    isPersonalAccount: ({ context }) =>
      context.accountType === "personal",
    hasCompletedAllSteps: ({ context }) =>
      context.completedSteps.length >= context.requiredSteps.length,
  },
  actions: {
    markStepComplete: assign({
      completedSteps: ({ context, event }) => [
        ...context.completedSteps,
        event.step,
      ],
    }),
    setAccountType: assign({
      accountType: ({ event }) => event.accountType,
      requiredSteps: ({ event }) =>
        event.accountType === "business"
          ? ["profile", "company", "team", "billing"]
          : ["profile", "preferences"],
    }),
  },
}).createMachine({
  id: "onboarding",
  initial: "accountType",
  context: {
    accountType: null,
    completedSteps: [],
    requiredSteps: [],
    userData: {},
  },
  states: {
    accountType: {
      on: {
        SELECT_TYPE: [
          {
            guard: "isBusinessAccount",
            target: "businessFlow",
            actions: "setAccountType",
          },
          {
            target: "personalFlow",
            actions: "setAccountType",
          },
        ],
      },
    },
    businessFlow: {
      initial: "profile",
      states: {
        profile: {
          on: { NEXT: "company" },
        },
        company: {
          on: {
            NEXT: "team",
            BACK: "profile",
          },
        },
        team: {
          on: {
            NEXT: "billing",
            BACK: "company",
          },
        },
        billing: {
          on: {
            SUBMIT: "#onboarding.complete",
            BACK: "team",
          },
        },
      },
    },
    personalFlow: {
      initial: "profile",
      states: {
        profile: {
          on: { NEXT: "preferences" },
        },
        preferences: {
          on: {
            SUBMIT: "#onboarding.complete",
            BACK: "profile",
          },
        },
      },
    },
    complete: {
      type: "final",
    },
  },
});
```

The conditional branching at the "accountType" state determines which sub-flow the user enters. Business accounts require four steps; personal accounts require two. The state machine enforces this branching structurally. There is no risk of a personal account user accidentally reaching the "team" or "billing" steps because those states exist only within the "businessFlow" branch.

---

## 4.5 Statecharts: Hierarchical and Parallel States

Plain finite state machines have a limitation: every state is at the same level. When a machine grows, the number of states and transitions can explode because states that share behavior must duplicate their transition definitions. Statecharts, introduced by David Harel in 1987, solve this through two mechanisms: hierarchical states (nesting) and parallel states (orthogonal regions).

### Hierarchical (Nested) States

Hierarchical states allow a state to contain sub-states. The parent state groups related behavior, and child states refine it. Events not handled by a child state bubble up to the parent, similar to how DOM events bubble through the element hierarchy.

Consider a media player. Without hierarchy, you would need states like `playing.normal`, `playing.fastForward`, `playing.rewind`, `paused.normal`, `paused.buffering`, and so on. With hierarchy, "playing" and "paused" are parent states with their own sub-states:

```javascript
import { setup, assign } from "xstate";

const mediaPlayerMachine = setup({
  actions: {
    updatePosition: assign({
      position: ({ context, event }) => event.position ?? context.position,
    }),
    setTrack: assign({
      currentTrack: ({ event }) => event.track,
      position: 0,
    }),
    setVolume: assign({
      volume: ({ event }) => Math.max(0, Math.min(1, event.level)),
    }),
  },
}).createMachine({
  id: "mediaPlayer",
  initial: "stopped",
  context: {
    currentTrack: null,
    position: 0,
    volume: 0.8,
    playbackRate: 1,
  },
  // This event is handled regardless of which state is active
  on: {
    SET_VOLUME: { actions: "setVolume" },
  },
  states: {
    stopped: {
      on: {
        PLAY: {
          target: "playing",
          actions: "setTrack",
        },
      },
    },
    playing: {
      initial: "normal",
      on: {
        PAUSE: "paused",
        STOP: {
          target: "stopped",
          actions: assign({ position: 0 }),
        },
      },
      states: {
        normal: {
          on: {
            FAST_FORWARD: "fastForward",
            REWIND: "rewind",
            TIME_UPDATE: { actions: "updatePosition" },
          },
        },
        fastForward: {
          entry: assign({ playbackRate: 2 }),
          exit: assign({ playbackRate: 1 }),
          on: {
            NORMAL_SPEED: "normal",
            REWIND: "rewind",
          },
        },
        rewind: {
          entry: assign({ playbackRate: -1 }),
          exit: assign({ playbackRate: 1 }),
          on: {
            NORMAL_SPEED: "normal",
            FAST_FORWARD: "fastForward",
          },
        },
      },
    },
    paused: {
      on: {
        PLAY: "playing",
        STOP: {
          target: "stopped",
          actions: assign({ position: 0 }),
        },
      },
    },
  },
});
```

Several key features of hierarchy are visible here:

1. **Event bubbling**: `SET_VOLUME` is defined at the root level. It fires regardless of whether the player is stopped, playing, or paused. Child states do not need to repeat this transition.

2. **Shared parent transitions**: `PAUSE` and `STOP` are defined on the "playing" parent state. They apply whether the player is in "normal," "fastForward," or "rewind" mode. Without hierarchy, each sub-state would need its own PAUSE and STOP transitions.

3. **Entry and exit actions**: The "fastForward" state sets `playbackRate` to 2 on entry and resets it on exit. This guarantees the rate is correct whenever the state is entered or left, regardless of which transition caused the change.

4. **History preservation**: When pausing and resuming, the machine returns to `playing.normal` (the initial child state). To return to the sub-state that was active before pausing, use a history state node.

### History States

A history state node remembers the last active child state of a parent. When a transition targets the history node, the machine resumes from where it left off:

```javascript
const playerWithHistory = createMachine({
  id: "player",
  initial: "stopped",
  states: {
    stopped: {
      on: { PLAY: "playing" },
    },
    playing: {
      initial: "normal",
      states: {
        normal: {
          on: {
            FAST_FORWARD: "fastForward",
            SLOW_MOTION: "slowMotion",
          },
        },
        fastForward: {
          on: { NORMAL_SPEED: "normal" },
        },
        slowMotion: {
          on: { NORMAL_SPEED: "normal" },
        },
        // History pseudo-state
        hist: {
          type: "history",
        },
      },
      on: {
        PAUSE: "paused",
      },
    },
    paused: {
      on: {
        // Resume returns to whichever playing sub-state was active
        RESUME: "playing.hist",
      },
    },
  },
});
```

If the user is in "fastForward" mode and pauses, then resumes, the machine returns to "fastForward" rather than "normal." The history node stores this information automatically.

### Parallel (Orthogonal) States

Parallel states model independent concerns that are active simultaneously. Each region within a parallel state is its own mini state machine, and they operate independently.

Consider a video conferencing application. Audio and video are independent: muting the microphone does not affect the camera. Screen sharing is independent of both. Without parallel states, you would need to enumerate every combination:

```
audioOn_videoOn_notSharing
audioOn_videoOn_sharing
audioOn_videoOff_notSharing
audioOn_videoOff_sharing
audioOff_videoOn_notSharing
audioOff_videoOn_sharing
audioOff_videoOff_notSharing
audioOff_videoOff_sharing
```

That is 8 states for 3 binary concerns. Adding a fourth concern (recording on/off) doubles it to 16. This is the state explosion problem. Parallel states solve it:

```javascript
import { createMachine } from "xstate";

const videoConferenceMachine = createMachine({
  id: "videoConference",
  type: "parallel",
  states: {
    audio: {
      initial: "unmuted",
      states: {
        unmuted: {
          on: { TOGGLE_AUDIO: "muted" },
        },
        muted: {
          on: { TOGGLE_AUDIO: "unmuted" },
        },
      },
    },
    video: {
      initial: "cameraOn",
      states: {
        cameraOn: {
          on: { TOGGLE_VIDEO: "cameraOff" },
        },
        cameraOff: {
          on: { TOGGLE_VIDEO: "cameraOn" },
        },
      },
    },
    screenShare: {
      initial: "inactive",
      states: {
        inactive: {
          on: { TOGGLE_SCREEN: "sharing" },
        },
        sharing: {
          on: { TOGGLE_SCREEN: "inactive" },
        },
      },
    },
    recording: {
      initial: "notRecording",
      states: {
        notRecording: {
          on: { TOGGLE_RECORDING: "recording" },
        },
        recording: {
          on: { TOGGLE_RECORDING: "notRecording" },
        },
      },
    },
  },
});
```

Four parallel regions, each with two states, produce 4 regions with 2 states each. The machine tracks 4 independent values rather than 2^4 = 16 combined states. Adding a fifth concern adds one more region rather than doubling the state count.

The state value of a parallel machine is an object reflecting the active state in each region:

```javascript
// Example snapshot.value:
{
  audio: "muted",
  video: "cameraOn",
  screenShare: "inactive",
  recording: "recording"
}
```

### Combining Hierarchy and Parallelism

Real applications often combine both. A form might have parallel validation regions for different field groups, each with its own hierarchical states:

```javascript
import { setup, assign } from "xstate";

const registrationMachine = setup({
  guards: {
    isEmailValid: ({ context }) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.email),
    isPasswordStrong: ({ context }) =>
      context.password.length >= 8 &&
      /[A-Z]/.test(context.password) &&
      /[0-9]/.test(context.password),
    doPasswordsMatch: ({ context }) =>
      context.password === context.confirmPassword,
  },
}).createMachine({
  id: "registration",
  type: "parallel",
  context: {
    email: "",
    password: "",
    confirmPassword: "",
  },
  states: {
    emailValidation: {
      initial: "pristine",
      states: {
        pristine: {
          on: {
            EMAIL_BLUR: [
              { guard: "isEmailValid", target: "valid" },
              { target: "invalid" },
            ],
          },
        },
        valid: {
          on: {
            EMAIL_CHANGE: "pristine",
          },
        },
        invalid: {
          on: {
            EMAIL_CHANGE: "pristine",
          },
        },
      },
    },
    passwordValidation: {
      initial: "pristine",
      states: {
        pristine: {
          on: {
            PASSWORD_BLUR: [
              { guard: "isPasswordStrong", target: "valid" },
              { target: "weak" },
            ],
          },
        },
        valid: {
          on: { PASSWORD_CHANGE: "pristine" },
        },
        weak: {
          on: { PASSWORD_CHANGE: "pristine" },
        },
      },
    },
    confirmValidation: {
      initial: "pristine",
      states: {
        pristine: {
          on: {
            CONFIRM_BLUR: [
              { guard: "doPasswordsMatch", target: "matching" },
              { target: "mismatch" },
            ],
          },
        },
        matching: {
          on: { CONFIRM_CHANGE: "pristine" },
        },
        mismatch: {
          on: { CONFIRM_CHANGE: "pristine" },
        },
      },
    },
  },
  on: {
    EMAIL_CHANGE: {
      actions: assign({ email: ({ event }) => event.value }),
    },
    PASSWORD_CHANGE: {
      actions: assign({ password: ({ event }) => event.value }),
    },
    CONFIRM_CHANGE: {
      actions: assign({ confirmPassword: ({ event }) => event.value }),
    },
  },
});
```

Each field has its own validation lifecycle (pristine, valid, invalid) running independently. Typing in one field does not reset the validation state of another. The root-level `on` handlers update context regardless of which validation states are active.

> **Common Mistake:** Developers sometimes model independent concerns as a single flat state machine with states like `emailValid_passwordWeak_confirmPristine`. This approach creates combinatorial explosion and makes each new validation rule exponentially more complex to add. If two concerns do not depend on each other's state, they belong in parallel regions.

---

## 4.6 Connecting State Machines to React Components

XState provides the `@xstate/react` package with hooks and utilities for integrating state machines into React's component model.

### useMachine

The `useMachine` hook creates an actor from a machine definition, starts it, and subscribes to its state changes:

```javascript
import { useMachine } from "@xstate/react";

function ToggleButton() {
  const [snapshot, send] = useMachine(toggleMachine);

  return (
    <button onClick={() => send({ type: "TOGGLE" })}>
      {snapshot.value === "active" ? "ON" : "OFF"}
    </button>
  );
}
```

The hook returns a tuple: `snapshot` is the current state snapshot (containing `value`, `context`, `matches()`, and other properties), and `send` is a function that dispatches events to the machine. The component re-renders whenever the machine transitions to a new state.

### useActor and useActorRef

`useActor` is similar to `useMachine` but accepts any actor logic, not just machines. `useActorRef` returns only the actor reference without subscribing to state changes, which is useful when a component only sends events without reading state:

```javascript
import { useActor, useActorRef } from "@xstate/react";

function Counter() {
  const [snapshot, send] = useActor(counterMachine);

  return (
    <div>
      <span>{snapshot.context.count}</span>
      <button onClick={() => send({ type: "INCREMENT" })}>+</button>
    </div>
  );
}

function ResetButton({ machineRef }) {
  // Does not re-render on state changes; only sends events
  return (
    <button onClick={() => machineRef.send({ type: "RESET" })}>
      Reset
    </button>
  );
}
```

### useSelector for Performance

When a component only needs a subset of the machine's state, `useSelector` prevents unnecessary re-renders by subscribing to a derived value:

```javascript
import { useSelector } from "@xstate/react";

function CartItemCount({ cartActorRef }) {
  // Only re-renders when the item count changes,
  // not on every state transition
  const itemCount = useSelector(
    cartActorRef,
    (snapshot) => snapshot.context.items.length
  );

  return <span className="badge">{itemCount}</span>;
}

function CartStatus({ cartActorRef }) {
  const isCheckingOut = useSelector(cartActorRef, (snapshot) =>
    snapshot.matches("checkout")
  );

  return isCheckingOut ? <Spinner /> : null;
}
```

The selector function receives the full snapshot and returns the value the component needs. React will only re-render the component when the selector's return value changes (compared by reference equality by default, or with an optional custom comparator as the third argument).

### Matching States

The `snapshot.matches()` method checks whether the machine is in a specific state, including nested states:

```javascript
function AuthView() {
  const [snapshot, send] = useMachine(authMachine);

  if (snapshot.matches("checkingSession")) {
    return <SplashScreen />;
  }

  if (snapshot.matches("unauthenticated")) {
    // Check nested states within "unauthenticated"
    if (snapshot.matches({ unauthenticated: "signInForm" })) {
      return (
        <SignInForm
          error={snapshot.context.error}
          onSubmit={(credentials) =>
            send({ type: "SUBMIT_SIGN_IN", ...credentials })
          }
          onSwitchToSignUp={() => send({ type: "GO_TO_SIGN_UP" })}
        />
      );
    }
    if (snapshot.matches({ unauthenticated: "signUpForm" })) {
      return (
        <SignUpForm
          error={snapshot.context.error}
          onSubmit={(credentials) =>
            send({ type: "SUBMIT_SIGN_UP", ...credentials })
          }
          onSwitchToSignIn={() => send({ type: "GO_TO_SIGN_IN" })}
        />
      );
    }
    if (snapshot.matches({ unauthenticated: "signingIn" })) {
      return <LoadingOverlay message="Signing in..." />;
    }
    if (snapshot.matches({ unauthenticated: "signingUp" })) {
      return <LoadingOverlay message="Creating account..." />;
    }
  }

  if (snapshot.matches("authenticated")) {
    return (
      <Dashboard
        user={snapshot.context.user}
        onSignOut={() => send({ type: "SIGN_OUT" })}
      />
    );
  }

  if (snapshot.matches("signingOut")) {
    return <LoadingOverlay message="Signing out..." />;
  }

  return null;
}
```

For nested states, `matches()` accepts an object where keys are parent state names and values are child state names. This is more expressive and less error-prone than string comparisons.

### createActorContext for Global Machines

When a state machine needs to be shared across a component subtree, `createActorContext` creates a React context with built-in hooks:

```javascript
import { createActorContext } from "@xstate/react";

// Create the context from the machine
const AuthContext = createActorContext(authMachine);

// Provider wraps the subtree
function App() {
  return (
    <AuthContext.Provider>
      <Header />
      <Main />
    </AuthContext.Provider>
  );
}

// Consuming components use the context's hooks
function Header() {
  // useSelector only re-renders when the selected value changes
  const userName = AuthContext.useSelector(
    (snapshot) => snapshot.context.user?.name
  );
  const actorRef = AuthContext.useActorRef();

  return (
    <header>
      {userName ? (
        <>
          <span>Welcome, {userName}</span>
          <button onClick={() => actorRef.send({ type: "SIGN_OUT" })}>
            Sign Out
          </button>
        </>
      ) : (
        <span>Please sign in</span>
      )}
    </header>
  );
}

function Main() {
  const isAuthenticated = AuthContext.useSelector((snapshot) =>
    snapshot.matches("authenticated")
  );

  return (
    <main>
      {isAuthenticated ? <Dashboard /> : <LandingPage />}
    </main>
  );
}
```

The `createActorContext` pattern has several advantages:

1. **No prop drilling**: child components access the machine via context hooks
2. **Selective subscriptions**: each component subscribes only to the state slices it needs via `useSelector`
3. **Single source of truth**: one machine instance manages the entire auth flow
4. **Testability**: the provider can receive a different machine instance or options for testing

### Providing Implementations

When using `createActorContext` or `useMachine`, you can override action and actor implementations at the provider level using the machine's `provide` method. This is essential for testing and for adapting a machine to different environments:

```javascript
function App() {
  const testMachine = authMachine.provide({
    actors: {
      checkSession: fromPromise(async () => {
        // Use a mock session check in tests
        return { user: { name: "Test User", role: "admin" } };
      }),
    },
    actions: {
      trackAnalytics: () => {
        // No-op in tests
      },
    },
  });

  return (
    <AuthContext.Provider logic={testMachine}>
      <App />
    </AuthContext.Provider>
  );
}
```

### Separating Machine Logic from Components

A recommended architectural pattern is to keep machine definitions in separate files from the components that use them:

```
features/
  checkout/
    checkout.machine.js    // Machine definition
    CheckoutFlow.jsx       // React component
    CheckoutContext.js     // createActorContext wrapper
    checkout.machine.test.js  // Machine unit tests
```

This separation enables testing the machine's logic independently of React:

```javascript
// checkout.machine.test.js
import { createActor } from "xstate";
import { checkoutMachine } from "./checkout.machine";

test("transitions from cart to shipping on PROCEED", () => {
  const actor = createActor(checkoutMachine);
  actor.start();

  actor.send({ type: "ADD_ITEM", item: { id: 1, price: 29.99 } });
  actor.send({ type: "PROCEED" });

  expect(actor.getSnapshot().matches("shipping")).toBe(true);
});

test("cannot proceed with empty cart", () => {
  const actor = createActor(checkoutMachine);
  actor.start();

  actor.send({ type: "PROCEED" });

  // Guard prevents transition; still in cart state
  expect(actor.getSnapshot().matches("cart")).toBe(true);
});
```

Testing the machine with `createActor` requires no React rendering, no DOM, and no component lifecycle. The machine is a pure specification of behavior that can be verified in isolation.

> **See Also:** Part 4, Chapter 6 for comprehensive testing strategies, including testing custom hooks and components that use state machines.

---

## 4.7 Exercise: Model a Checkout Flow as a State Machine

### Problem Statement

Build a complete checkout flow for an e-commerce application using XState v5 and React. The flow must support the following stages:

1. **Cart**: display items, allow adding/removing items, show subtotal
2. **Shipping**: collect shipping address, validate required fields
3. **Payment**: collect payment details, validate card information
4. **Review**: display all collected information for confirmation
5. **Processing**: submit the order (invoke an async API call)
6. **Confirmation**: display order confirmation with an order ID
7. **Error**: handle submission failure with a retry option

Requirements:

- Users can navigate backward from Shipping, Payment, and Review
- Users cannot proceed from Cart with zero items
- Users cannot proceed from Shipping or Payment without valid form data
- The Processing state must invoke an async actor and handle both success and failure
- The machine must accumulate data across steps in its context
- Build a React UI that renders the correct component for each state

### Starter Code

```javascript
// checkout.machine.js
import { setup, assign, fromPromise } from "xstate";

// TODO: Define the checkout machine using setup() and createMachine()
// Include:
// - Context for items, shippingAddress, paymentDetails, orderId, error
// - Guards for cart validation, shipping validation, payment validation
// - Actions for adding/removing items, updating form data
// - An actor for submitting the order

export const checkoutMachine = null; // Replace with your machine
```

```javascript
// CheckoutFlow.jsx
import { useMachine } from "@xstate/react";
import { checkoutMachine } from "./checkout.machine";

// TODO: Build the React component that renders based on machine state
// Use snapshot.matches() to determine which step component to render
// Pass send() to child components for event dispatching

export function CheckoutFlow() {
  return null; // Replace with your implementation
}
```

### Solution

```javascript
// checkout.machine.js
import { setup, assign, fromPromise } from "xstate";

const submitOrder = fromPromise(async ({ input }) => {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: input.items,
      shipping: input.shippingAddress,
      payment: {
        last4: input.paymentDetails.cardNumber.slice(-4),
        expiryDate: input.paymentDetails.expiryDate,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Order submission failed");
  }

  return response.json(); // Expected: { orderId: "ORD-12345" }
});

export const checkoutMachine = setup({
  actors: {
    submitOrder,
  },
  guards: {
    hasItems: ({ context }) => context.items.length > 0,
    isShippingValid: ({ context }) => {
      const { name, street, city, state, zipCode } = context.shippingAddress;
      return (
        name.trim().length > 0 &&
        street.trim().length > 0 &&
        city.trim().length > 0 &&
        state.trim().length > 0 &&
        /^\d{5}(-\d{4})?$/.test(zipCode)
      );
    },
    isPaymentValid: ({ context }) => {
      const { cardNumber, expiryDate, cvv } = context.paymentDetails;
      const cleanCardNumber = cardNumber.replace(/\s/g, "");
      return (
        cleanCardNumber.length === 16 &&
        /^\d+$/.test(cleanCardNumber) &&
        /^\d{2}\/\d{2}$/.test(expiryDate) &&
        /^\d{3,4}$/.test(cvv)
      );
    },
  },
  actions: {
    addItem: assign({
      items: ({ context, event }) => [
        ...context.items,
        {
          id: event.item.id,
          name: event.item.name,
          price: event.item.price,
          quantity: event.item.quantity ?? 1,
        },
      ],
    }),
    removeItem: assign({
      items: ({ context, event }) =>
        context.items.filter((item) => item.id !== event.itemId),
    }),
    updateQuantity: assign({
      items: ({ context, event }) =>
        context.items.map((item) =>
          item.id === event.itemId
            ? { ...item, quantity: Math.max(1, event.quantity) }
            : item
        ),
    }),
    updateShipping: assign({
      shippingAddress: ({ context, event }) => ({
        ...context.shippingAddress,
        ...event.data,
      }),
    }),
    updatePayment: assign({
      paymentDetails: ({ context, event }) => ({
        ...context.paymentDetails,
        ...event.data,
      }),
    }),
    assignOrderId: assign({
      orderId: ({ event }) => event.output.orderId,
    }),
    assignError: assign({
      error: ({ event }) => event.error.message,
    }),
    clearError: assign({ error: null }),
  },
}).createMachine({
  id: "checkout",
  initial: "cart",
  context: {
    items: [],
    shippingAddress: {
      name: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
    },
    paymentDetails: {
      cardNumber: "",
      expiryDate: "",
      cvv: "",
    },
    orderId: null,
    error: null,
  },
  states: {
    cart: {
      on: {
        ADD_ITEM: { actions: "addItem" },
        REMOVE_ITEM: { actions: "removeItem" },
        UPDATE_QUANTITY: { actions: "updateQuantity" },
        PROCEED: {
          guard: "hasItems",
          target: "shipping",
        },
      },
    },
    shipping: {
      on: {
        UPDATE_SHIPPING: { actions: "updateShipping" },
        BACK: "cart",
        PROCEED: [
          {
            guard: "isShippingValid",
            target: "payment",
          },
        ],
      },
    },
    payment: {
      on: {
        UPDATE_PAYMENT: { actions: "updatePayment" },
        BACK: "shipping",
        PROCEED: [
          {
            guard: "isPaymentValid",
            target: "review",
          },
        ],
      },
    },
    review: {
      on: {
        BACK: "payment",
        EDIT_CART: "cart",
        EDIT_SHIPPING: "shipping",
        EDIT_PAYMENT: "payment",
        CONFIRM: "processing",
      },
    },
    processing: {
      entry: "clearError",
      invoke: {
        src: "submitOrder",
        input: ({ context }) => ({
          items: context.items,
          shippingAddress: context.shippingAddress,
          paymentDetails: context.paymentDetails,
        }),
        onDone: {
          target: "confirmation",
          actions: "assignOrderId",
        },
        onError: {
          target: "error",
          actions: "assignError",
        },
      },
    },
    confirmation: {
      type: "final",
    },
    error: {
      on: {
        RETRY: "processing",
        EDIT_PAYMENT: "payment",
      },
    },
  },
});
```

```javascript
// CheckoutFlow.jsx
import { useMachine } from "@xstate/react";
import { checkoutMachine } from "./checkout.machine";

function CartStep({ context, send }) {
  const subtotal = context.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div>
      <h2>Your Cart</h2>
      {context.items.length === 0 ? (
        <p>Your cart is empty. Add some items to proceed.</p>
      ) : (
        <ul>
          {context.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.name} - ${item.price.toFixed(2)} x {item.quantity}
              </span>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) =>
                  send({
                    type: "UPDATE_QUANTITY",
                    itemId: item.id,
                    quantity: parseInt(e.target.value, 10),
                  })
                }
              />
              <button
                onClick={() =>
                  send({ type: "REMOVE_ITEM", itemId: item.id })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>Subtotal: ${subtotal.toFixed(2)}</p>
      <button
        onClick={() =>
          send({
            type: "ADD_ITEM",
            item: {
              id: Date.now(),
              name: "Sample Product",
              price: 19.99,
              quantity: 1,
            },
          })
        }
      >
        Add Sample Item
      </button>
      <button
        onClick={() => send({ type: "PROCEED" })}
        disabled={context.items.length === 0}
      >
        Continue to Shipping
      </button>
    </div>
  );
}

function ShippingStep({ context, send }) {
  const { shippingAddress } = context;

  function handleChange(field) {
    return (e) =>
      send({
        type: "UPDATE_SHIPPING",
        data: { [field]: e.target.value },
      });
  }

  return (
    <div>
      <h2>Shipping Address</h2>
      <label>
        Full Name
        <input value={shippingAddress.name} onChange={handleChange("name")} />
      </label>
      <label>
        Street Address
        <input
          value={shippingAddress.street}
          onChange={handleChange("street")}
        />
      </label>
      <label>
        City
        <input value={shippingAddress.city} onChange={handleChange("city")} />
      </label>
      <label>
        State
        <input value={shippingAddress.state} onChange={handleChange("state")} />
      </label>
      <label>
        ZIP Code
        <input
          value={shippingAddress.zipCode}
          onChange={handleChange("zipCode")}
        />
      </label>
      <div>
        <button onClick={() => send({ type: "BACK" })}>Back to Cart</button>
        <button onClick={() => send({ type: "PROCEED" })}>
          Continue to Payment
        </button>
      </div>
    </div>
  );
}

function PaymentStep({ context, send }) {
  const { paymentDetails } = context;

  function handleChange(field) {
    return (e) =>
      send({
        type: "UPDATE_PAYMENT",
        data: { [field]: e.target.value },
      });
  }

  return (
    <div>
      <h2>Payment Details</h2>
      <label>
        Card Number
        <input
          value={paymentDetails.cardNumber}
          onChange={handleChange("cardNumber")}
          placeholder="1234 5678 9012 3456"
        />
      </label>
      <label>
        Expiry Date
        <input
          value={paymentDetails.expiryDate}
          onChange={handleChange("expiryDate")}
          placeholder="MM/YY"
        />
      </label>
      <label>
        CVV
        <input
          value={paymentDetails.cvv}
          onChange={handleChange("cvv")}
          placeholder="123"
          type="password"
        />
      </label>
      <div>
        <button onClick={() => send({ type: "BACK" })}>
          Back to Shipping
        </button>
        <button onClick={() => send({ type: "PROCEED" })}>
          Review Order
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ context, send }) {
  const subtotal = context.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div>
      <h2>Review Your Order</h2>

      <section>
        <h3>
          Items{" "}
          <button onClick={() => send({ type: "EDIT_CART" })}>Edit</button>
        </h3>
        <ul>
          {context.items.map((item) => (
            <li key={item.id}>
              {item.name} x{item.quantity} - $
              {(item.price * item.quantity).toFixed(2)}
            </li>
          ))}
        </ul>
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
      </section>

      <section>
        <h3>
          Shipping{" "}
          <button onClick={() => send({ type: "EDIT_SHIPPING" })}>Edit</button>
        </h3>
        <p>
          {context.shippingAddress.name}
          <br />
          {context.shippingAddress.street}
          <br />
          {context.shippingAddress.city}, {context.shippingAddress.state}{" "}
          {context.shippingAddress.zipCode}
        </p>
      </section>

      <section>
        <h3>
          Payment{" "}
          <button onClick={() => send({ type: "EDIT_PAYMENT" })}>Edit</button>
        </h3>
        <p>
          Card ending in{" "}
          {context.paymentDetails.cardNumber.replace(/\s/g, "").slice(-4)}
        </p>
      </section>

      <div>
        <button onClick={() => send({ type: "BACK" })}>
          Back to Payment
        </button>
        <button onClick={() => send({ type: "CONFIRM" })}>
          Place Order
        </button>
      </div>
    </div>
  );
}

function ProcessingStep() {
  return (
    <div>
      <h2>Processing Your Order...</h2>
      <p>Please wait while we submit your order.</p>
    </div>
  );
}

function ConfirmationStep({ context }) {
  return (
    <div>
      <h2>Order Confirmed</h2>
      <p>
        Your order <strong>{context.orderId}</strong> has been placed
        successfully.
      </p>
      <p>A confirmation email will be sent to your address.</p>
    </div>
  );
}

function ErrorStep({ context, send }) {
  return (
    <div>
      <h2>Something Went Wrong</h2>
      <p>{context.error}</p>
      <button onClick={() => send({ type: "RETRY" })}>Retry</button>
      <button onClick={() => send({ type: "EDIT_PAYMENT" })}>
        Update Payment Details
      </button>
    </div>
  );
}

// Step indicator labels and their corresponding machine states
const STEPS = [
  { label: "Cart", state: "cart" },
  { label: "Shipping", state: "shipping" },
  { label: "Payment", state: "payment" },
  { label: "Review", state: "review" },
  { label: "Confirmation", state: "confirmation" },
];

function StepIndicator({ snapshot }) {
  const currentIndex = STEPS.findIndex(
    (step) =>
      snapshot.matches(step.state) ||
      (step.state === "confirmation" &&
        (snapshot.matches("processing") || snapshot.matches("error")))
  );

  return (
    <nav aria-label="Checkout progress">
      <ol style={{ display: "flex", listStyle: "none", gap: "1rem" }}>
        {STEPS.map((step, index) => (
          <li
            key={step.state}
            style={{
              fontWeight: index === currentIndex ? "bold" : "normal",
              opacity: index <= currentIndex ? 1 : 0.5,
            }}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CheckoutFlow() {
  const [snapshot, send] = useMachine(checkoutMachine);

  return (
    <div>
      <StepIndicator snapshot={snapshot} />

      {snapshot.matches("cart") && (
        <CartStep context={snapshot.context} send={send} />
      )}
      {snapshot.matches("shipping") && (
        <ShippingStep context={snapshot.context} send={send} />
      )}
      {snapshot.matches("payment") && (
        <PaymentStep context={snapshot.context} send={send} />
      )}
      {snapshot.matches("review") && (
        <ReviewStep context={snapshot.context} send={send} />
      )}
      {snapshot.matches("processing") && <ProcessingStep />}
      {snapshot.matches("confirmation") && (
        <ConfirmationStep context={snapshot.context} />
      )}
      {snapshot.matches("error") && (
        <ErrorStep context={snapshot.context} send={send} />
      )}
    </div>
  );
}
```

**Key Takeaway:** The checkout machine encodes the entire business logic of the flow: which steps exist, what data each step collects, when progression is allowed, how errors are handled, and which backward navigation paths are valid. The React components become pure renderers of state, dispatching events to the machine without implementing any flow logic themselves. This separation makes the flow testable without React, documentable as a state diagram, and modifiable without risking broken transitions.

---

## Chapter Summary

State machines replace fragile boolean-based state management with explicit, finite states and constrained transitions. The boolean explosion problem, where N independent flags produce 2^N possible combinations with most being invalid, is eliminated by enumerating states and defining the exact events that can move between them. React's `useReducer` can implement lightweight state machines through a transition graph pattern, suitable for single-component flows. XState v5 provides a full statechart implementation with the `setup()` API, context for extended state, guards for conditional transitions, and actor logic creators for side effects. Hierarchical states reduce duplication through event bubbling and shared parent transitions, while parallel states model independent concerns without combinatorial explosion. The `@xstate/react` hooks (`useMachine`, `useSelector`, `createActorContext`) integrate these machines into React components with fine-grained subscription control.

## Further Reading

- [XState v5 Documentation](https://stately.ai/docs) (Stately, official docs for the current version)
- [Statecharts: A Visual Formalism for Complex Systems](https://www.sciencedirect.com/science/article/pii/0167642387900359) (David Harel, 1987; the foundational paper)
- [Enumerate, Don't Booleanate](https://kyleshevlin.com/enumerate-dont-booleanate/) (Kyle Shevlin; the case for replacing booleans with enums)
- [Make Impossible States Impossible](https://kentcdodds.com/blog/make-impossible-states-impossible) (Kent C. Dodds; practical examples of eliminating impossible state combinations)
- [How to Use useReducer as a Finite State Machine](https://kyleshevlin.com/how-to-use-usereducer-as-a-finite-state-machine/) (Kyle Shevlin; the transition graph pattern)
- [XState by Example](https://xstatebyexample.com/) (community-driven patterns for authentication, forms, and more)
- [Stately Studio](https://stately.ai/editor) (visual editor for designing, simulating, and exporting XState machines)
