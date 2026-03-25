# Part 4, Chapter 10: Authentication & Authorization Patterns

## What You Will Learn

- Differentiate between authentication and authorization, and select the appropriate auth flow (JWT, sessions, OAuth with PKCE) for a given application architecture
- Implement protected routes using route guards that handle loading states, redirects, and role restrictions
- Design an Auth Context and Auth Provider that centralizes auth state and exposes a clean API to the entire component tree
- Build a silent token refresh mechanism using HTTP interceptors that queues failed requests and retries them transparently
- Implement Role-Based Access Control (RBAC) at both the route level and the component level
- Apply permission-based rendering to conditionally show or hide UI elements based on granular user permissions
- Evaluate token storage strategies (memory, cookies, localStorage) and choose the most secure option for a given threat model

---

## 10.1 Auth Flow Architecture

Authentication and authorization are two distinct concerns that are often conflated. Authentication answers the question "Who are you?" while authorization answers "What are you allowed to do?" A robust React application must address both, and the architecture chosen for each has deep implications for security, user experience, and maintainability.

### 10.1.1 Authentication vs. Authorization

```
+-------------------+       +---------------------+
|  Authentication   |       |   Authorization     |
+-------------------+       +---------------------+
| Verifies identity |       | Verifies permission |
| "Who are you?"    |       | "Can you do this?"  |
| Login, signup     |       | Roles, permissions  |
| Happens first     |       | Happens after auth  |
+-------------------+       +---------------------+
```

In a React application, authentication determines whether a user can access the app at all, while authorization determines which parts of the app they can access and what actions they can perform. These concerns should be modeled separately in code, even when they share infrastructure like an auth provider.

### 10.1.2 Session-Based Authentication

Session-based authentication is the oldest and most straightforward model. After a user logs in, the server creates a session record (stored in memory, a database, or a cache like Redis) and sends back a session ID as an HTTP cookie.

```javascript
// Server-side session creation (Express example for context)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await verifyCredentials(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Session is stored server-side; only the ID travels to the client
  req.session.userId = user.id;
  req.session.role = user.role;

  res.json({ user: { id: user.id, name: user.name, role: user.role } });
});
```

```javascript
// React: the client does not manage the session directly.
// Cookies are sent automatically with every request.
async function login(email, password) {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Critical: sends cookies with the request
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  return response.json();
}
```

**Advantages of sessions:** The server controls the session lifecycle entirely. Revoking access is immediate: delete the session record, and the next request is rejected. There is no cryptographic material on the client to steal.

**Disadvantages of sessions:** Sessions require server-side state, which complicates horizontal scaling. Every request must look up the session, adding latency. Cross-domain requests require careful CORS and cookie configuration.

### 10.1.3 JSON Web Tokens (JWT)

JWTs are self-contained tokens that encode user identity and claims in a signed payload. The server issues a token after login; the client stores it and includes it in subsequent requests, typically in the `Authorization` header.

```
JWT Structure:
+------------------+-------------------+------------------+
|     Header       |     Payload       |    Signature     |
+------------------+-------------------+------------------+
| { "alg": "HS256",| { "sub": "user1",| HMACSHA256(      |
|   "typ": "JWT" } |   "role": "admin",|   base64(header) |
|                  |   "exp": 1710000 }|   + "." +        |
|                  |                   |   base64(payload),|
|                  |                   |   secret)        |
+------------------+-------------------+------------------+
```

```javascript
// Decoding a JWT payload on the client (for display purposes only)
function decodeJwtPayload(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );

  return JSON.parse(jsonPayload);
}

// Example usage
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSIsInJvbGUiOiJhZG1pbiJ9.signature';
const payload = decodeJwtPayload(token);
console.log(payload.sub);  // "user1"
console.log(payload.role); // "admin"
```

> **Common Mistake:** Developers sometimes decode a JWT on the client and trust its contents for authorization decisions. The client can decode a JWT, but it cannot verify its signature (that requires the server's secret key). Never trust a decoded JWT for security decisions on the client. The server must validate the token on every request. Client-side decoding is acceptable only for display purposes (showing a username) or checking token expiry to trigger a refresh.

**Advantages of JWTs:** Stateless on the server; no session store is required. They work naturally across microservices since any service with the signing key can validate the token. They scale horizontally without shared state.

**Disadvantages of JWTs:** Tokens cannot be revoked before expiry without a server-side blocklist (which reintroduces state). Token size grows as claims are added. If stored in localStorage, they are vulnerable to XSS attacks.

### 10.1.4 OAuth 2.0 with PKCE

OAuth 2.0 is a delegation protocol: it allows a user to grant a third-party application limited access to a resource on their behalf, without sharing credentials. For single-page applications, the Authorization Code flow with PKCE (Proof Key for Code Exchange) is the recommended approach, replacing the older Implicit flow.

```
OAuth 2.0 Authorization Code Flow with PKCE:

  React App                Auth Server              Resource Server
     |                         |                          |
     |  1. Generate code       |                          |
     |     verifier + challenge|                          |
     |                         |                          |
     |  2. Redirect to /authorize                         |
     |     with challenge  --->|                          |
     |                         |                          |
     |  3. User authenticates  |                          |
     |     and consents        |                          |
     |                         |                          |
     |  4. Redirect back with  |                          |
     |     authorization code  |                          |
     |<------------------------|                          |
     |                         |                          |
     |  5. Exchange code +     |                          |
     |     verifier for tokens |                          |
     |------------------------>|                          |
     |                         |                          |
     |  6. Access + refresh    |                          |
     |     tokens returned     |                          |
     |<------------------------|                          |
     |                         |                          |
     |  7. API request with    |                          |
     |     access token        |------------------------->|
     |                         |                          |
     |  8. Protected resource  |                          |
     |<---------------------------------------------------|
```

```javascript
// Step 1: Generate PKCE code verifier and challenge
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Step 2: Redirect the user to the authorization server
async function initiateOAuthLogin() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier for the callback step
  sessionStorage.setItem('pkce_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'your-client-id',
    redirect_uri: 'https://yourapp.com/callback',
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: crypto.randomUUID(), // CSRF protection
  });

  window.location.href = `https://auth.example.com/authorize?${params}`;
}

// Step 5: Exchange the authorization code for tokens (on the callback page)
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

  const response = await fetch('https://auth.example.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://yourapp.com/callback',
      client_id: 'your-client-id',
      code_verifier: codeVerifier,
    }),
  });

  const tokens = await response.json();
  sessionStorage.removeItem('pkce_code_verifier');

  return tokens; // { access_token, refresh_token, id_token, expires_in }
}
```

PKCE prevents authorization code interception attacks. Even if an attacker intercepts the authorization code during the redirect, they cannot exchange it for tokens without the original code verifier, which never leaves the client.

### 10.1.5 Choosing the Right Flow

| Factor | Sessions | JWT | OAuth + PKCE |
|---|---|---|---|
| Server state required | Yes | No (unless blocklist) | Depends on provider |
| Revocation | Immediate | Requires blocklist | Provider-managed |
| Cross-domain | Difficult | Natural | Built-in |
| Third-party login | No | Possible | Primary use case |
| Complexity | Low | Medium | High |
| Best for | Traditional SPAs with single backend | Microservice architectures | Third-party identity providers |

---

## 10.2 Protected Routes with Route Guards

A protected route is a route that requires authentication (and optionally, specific authorization) before rendering its content. Route guards are the mechanism that enforces this requirement.

### 10.2.1 The Core Pattern

The simplest route guard is a wrapper component that checks authentication status and either renders its children or redirects to a login page.

```javascript
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Critical: show a loading state while verifying the token.
  // Without this, the user flashes to the login page on every refresh.
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    // Preserve the attempted URL so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

> **Common Mistake:** Omitting the loading state check in a route guard causes a flash redirect. When the app first loads, the auth state is unknown (the token has not been verified yet). Without an `isLoading` guard, the component assumes the user is unauthenticated and redirects to `/login`. Once the token verification completes, the user is bounced back. This creates a jarring flicker. Always handle the three states: loading, authenticated, and unauthenticated.

### 10.2.2 Integrating with React Router

Route guards integrate cleanly with React Router's nested route structure using layout routes.

```javascript
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
  },

  // Protected routes (all children require authentication)
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardHome /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },

  // Admin-only routes (require authentication + admin role)
  {
    element: <ProtectedRoute requiredRole="admin" />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'users', element: <UserManagement /> },
        ],
      },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

### 10.2.3 Role-Based Route Guards

Extending the basic pattern to support role requirements:

```javascript
function ProtectedRoute({ requiredRole, requiredPermissions }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role if specified
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Check permissions if specified
  if (requiredPermissions) {
    const hasAllPermissions = requiredPermissions.every((permission) =>
      user.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}
```

### 10.2.4 Redirecting After Login

A polished auth flow redirects users back to the page they originally requested after a successful login.

```javascript
function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The route guard stored the attempted URL in location.state
  const from = location.state?.from?.pathname || '/';

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    try {
      await login(formData.get('email'), formData.get('password'));
      // Navigate to the originally requested page
      navigate(from, { replace: true });
    } catch (error) {
      // Handle login error
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Log In</button>
    </form>
  );
}
```

> **See Also:** Part 3, Chapter 7, Section on React Router for foundational routing concepts and nested route patterns.

---

## 10.3 Auth Context and the Auth Provider Pattern

The Auth Provider pattern centralizes all authentication logic into a single context provider, giving the entire component tree access to authentication state and actions through a custom hook.

### 10.3.1 Designing the Auth State

A well-designed auth state must represent three distinct phases: initializing (verifying a stored token), authenticated (user is confirmed), and unauthenticated (no valid session).

```javascript
// The auth state should capture these three phases explicitly:
//
// Phase 1: Initializing
//   { user: null, isLoading: true }
//   The app is checking whether a stored token/session is still valid.
//
// Phase 2: Authenticated
//   { user: { id, name, email, role, permissions }, isLoading: false }
//   The user has been verified.
//
// Phase 3: Unauthenticated
//   { user: null, isLoading: false }
//   No valid session exists.
```

### 10.3.2 Building the Auth Provider

```javascript
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, verify any existing session/token
  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (response.ok) {
          const userData = await response.json();
          if (!cancelled) {
            setUser(userData);
          }
        }
      } catch (error) {
        // Network error or server down; treat as unauthenticated
        console.error('Session verification failed:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const userData = await response.json();
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      // Always clear local state, even if the server request fails
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthProvider, useAuth };
```

### 10.3.3 Why Memoization Matters in Auth Context

The `useMemo` wrapping the context value is not optional. Without it, every state change in the `AuthProvider` (or its parent) creates a new object reference, causing every consumer of `useAuth()` to re-render.

```javascript
// Without useMemo: new object every render, all consumers re-render
const value = { user, isLoading, login, logout };

// With useMemo: stable reference, consumers re-render only when
// user, isLoading, login, or logout actually change
const value = useMemo(
  () => ({ user, isLoading, login, logout }),
  [user, isLoading, login, logout]
);
```

> **See Also:** Part 4, Chapter 1, Section on measuring re-renders, and Part 3, Chapter 4 for context splitting strategies that can further reduce unnecessary re-renders.

### 10.3.4 Separating Auth State from Auth Actions

For applications with many context consumers, splitting the auth context into two separate contexts (one for state, one for actions) prevents components that only call `login()` or `logout()` from re-rendering when the user object changes.

```javascript
const AuthStateContext = createContext(null);
const AuthActionsContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ... same initialization logic as above ...

  const login = useCallback(async (email, password) => {
    // ... login logic ...
  }, []);

  const logout = useCallback(async () => {
    // ... logout logic ...
  }, []);

  const state = useMemo(() => ({ user, isLoading }), [user, isLoading]);
  const actions = useMemo(() => ({ login, logout }), [login, logout]);

  return (
    <AuthStateContext.Provider value={state}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
}

function useAuthState() {
  const context = useContext(AuthStateContext);
  if (context === null) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }
  return context;
}

function useAuthActions() {
  const context = useContext(AuthActionsContext);
  if (context === null) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }
  return context;
}
```

With this split, a logout button that only needs the `logout` function will not re-render when the user object updates:

```javascript
function LogoutButton() {
  // This component only subscribes to actions, not state
  const { logout } = useAuthActions();

  return <button onClick={logout}>Sign Out</button>;
}
```

### 10.3.5 Auth Provider Placement

The Auth Provider must wrap both the router and any component that needs auth state. However, it should not wrap the entire application unnecessarily.

```javascript
// Correct: AuthProvider wraps the router
function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

// Also correct: if using non-data router
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

---

## 10.4 Token Refresh: Silent Refresh, Interceptors

Access tokens should be short-lived (typically 5 to 15 minutes) to limit the window of damage if a token is compromised. Refresh tokens are longer-lived and allow the client to obtain new access tokens without requiring the user to re-authenticate.

### 10.4.1 The Token Lifecycle

```
Token Lifecycle:

  Login                      Access Token Expires           Refresh Token Expires
    |                              |                              |
    v                              v                              v
  +----------+    5-15 min    +-----------+   use refresh    +-----------+
  | Access   | ------------> | Expired   | --------------> | New Access|
  | Token    |               | Access    |   token to get  | Token     |
  +----------+               +-----------+   new access    +-----------+
  +----------+    hours/days  +-----------+                 +-----------+
  | Refresh  | ------------> | Expired   | -------> Force  | Re-login  |
  | Token    |               | Refresh   |          logout | Required  |
  +----------+               +-----------+                 +-----------+
```

### 10.4.2 Building an HTTP Client with Interceptors

An HTTP interceptor automatically attaches the access token to outgoing requests and handles token refresh when a request fails with a 401 status.

```javascript
// apiClient.js
// A configured HTTP client that handles token attachment and refresh

let accessToken = null;
let refreshPromise = null;

function setAccessToken(token) {
  accessToken = token;
}

function getAccessToken() {
  return accessToken;
}

function clearAccessToken() {
  accessToken = null;
}

async function refreshAccessToken() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // The refresh token lives in an HttpOnly cookie
  });

  if (!response.ok) {
    clearAccessToken();
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

async function apiClient(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach access token if available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If unauthorized, attempt a silent refresh
  if (response.status === 401 && accessToken) {
    try {
      // Deduplicate concurrent refresh attempts
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken();
      }

      const newToken = await refreshPromise;
      refreshPromise = null;

      // Retry the original request with the new token
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch (refreshError) {
      refreshPromise = null;
      // Refresh failed; redirect to login
      window.location.href = '/login';
      throw refreshError;
    }
  }

  return response;
}

export { apiClient, setAccessToken, getAccessToken, clearAccessToken };
```

### 10.4.3 Request Queue for Concurrent Failures

When multiple API calls fail simultaneously because the access token expired, only one refresh request should be sent. All other requests must wait for the refresh to complete and then retry with the new token. The implementation above handles this with the `refreshPromise` variable, but a more robust solution uses an explicit queue.

```javascript
// apiClientWithQueue.js
let accessToken = null;
let isRefreshing = false;
let failedRequestQueue = [];

function processQueue(error, token = null) {
  failedRequestQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedRequestQueue = [];
}

async function apiClient(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    if (isRefreshing) {
      // A refresh is already in progress; queue this request
      return new Promise((resolve, reject) => {
        failedRequestQueue.push({ resolve, reject });
      }).then((newToken) => {
        headers['Authorization'] = `Bearer ${newToken}`;
        return fetch(url, { ...options, headers, credentials: 'include' });
      });
    }

    isRefreshing = true;

    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!refreshResponse.ok) {
        throw new Error('Refresh failed');
      }

      const data = await refreshResponse.json();
      accessToken = data.accessToken;

      // Resolve all queued requests with the new token
      processQueue(null, accessToken);

      // Retry the original request
      headers['Authorization'] = `Bearer ${accessToken}`;
      response = await fetch(url, { ...options, headers, credentials: 'include' });
    } catch (error) {
      processQueue(error);
      accessToken = null;
      window.location.href = '/login';
      throw error;
    } finally {
      isRefreshing = false;
    }
  }

  return response;
}

export { apiClient };
```

### 10.4.4 Proactive Token Refresh

Rather than waiting for a 401 response, a proactive approach refreshes the token before it expires. This eliminates the latency of a failed request followed by a refresh and retry.

```javascript
// tokenScheduler.js
let refreshTimeout = null;

function scheduleTokenRefresh(expiresIn, onRefresh) {
  // Refresh 60 seconds before expiry (or at 75% of the token's lifetime)
  const refreshAt = Math.max((expiresIn - 60) * 1000, expiresIn * 750);

  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(async () => {
    try {
      const newTokenData = await onRefresh();
      // Schedule the next refresh based on the new token's expiry
      scheduleTokenRefresh(newTokenData.expiresIn, onRefresh);
    } catch (error) {
      console.error('Proactive token refresh failed:', error);
      // Fall back to the interceptor-based refresh on the next API call
    }
  }, refreshAt);
}

function cancelTokenRefresh() {
  clearTimeout(refreshTimeout);
}

export { scheduleTokenRefresh, cancelTokenRefresh };
```

```javascript
// Integrating proactive refresh with the Auth Provider
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    setAccessToken(data.accessToken);
    setUser(data.user);

    // Start proactive refresh cycle
    scheduleTokenRefresh(data.expiresIn, async () => {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const refreshData = await refreshResponse.json();
      setAccessToken(refreshData.accessToken);
      return refreshData;
    });

    return data.user;
  }, []);

  const logout = useCallback(async () => {
    cancelTokenRefresh();
    clearAccessToken();
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  // ... rest of provider ...
}
```

> **Common Mistake:** Setting the refresh timer to fire exactly when the token expires creates a race condition. If the refresh request takes even a moment, the token is already expired and API calls made in that window will fail. Always refresh well before expiry (at least 30 to 60 seconds).

---

## 10.5 Role-Based Access Control (RBAC) in Components

RBAC restricts system access based on the roles assigned to a user. Instead of granting permissions directly to individuals, permissions are grouped into roles (admin, editor, viewer), and users are assigned one or more roles.

### 10.5.1 Modeling Roles and Permissions

A clean RBAC model separates the role definition from the permission checks. Define roles and their associated permissions in a single, centralized configuration.

```javascript
// permissions.js
// Centralized role-permission mapping

const ROLES = {
  admin: {
    permissions: [
      'users:read',
      'users:write',
      'users:delete',
      'posts:read',
      'posts:write',
      'posts:delete',
      'posts:publish',
      'analytics:read',
      'settings:write',
    ],
  },
  editor: {
    permissions: [
      'posts:read',
      'posts:write',
      'posts:publish',
      'analytics:read',
    ],
  },
  author: {
    permissions: [
      'posts:read',
      'posts:write',
    ],
  },
  viewer: {
    permissions: [
      'posts:read',
    ],
  },
};

function getRolePermissions(role) {
  return ROLES[role]?.permissions || [];
}

function hasPermission(userRole, permission) {
  const permissions = getRolePermissions(userRole);
  return permissions.includes(permission);
}

function hasAnyPermission(userRole, requiredPermissions) {
  const permissions = getRolePermissions(userRole);
  return requiredPermissions.some((p) => permissions.includes(p));
}

function hasAllPermissions(userRole, requiredPermissions) {
  const permissions = getRolePermissions(userRole);
  return requiredPermissions.every((p) => permissions.includes(p));
}

export { ROLES, getRolePermissions, hasPermission, hasAnyPermission, hasAllPermissions };
```

### 10.5.2 Role-Gated Components

With the permission model in place, create a declarative component that conditionally renders children based on the user's role.

```javascript
import { useAuth } from './AuthContext';
import { hasPermission, hasAllPermissions, hasAnyPermission } from './permissions';

function Can({ permission, permissions, requireAll = true, fallback = null, children }) {
  const { user } = useAuth();

  if (!user) {
    return fallback;
  }

  // Single permission check
  if (permission) {
    return hasPermission(user.role, permission) ? children : fallback;
  }

  // Multiple permission check
  if (permissions) {
    const authorized = requireAll
      ? hasAllPermissions(user.role, permissions)
      : hasAnyPermission(user.role, permissions);

    return authorized ? children : fallback;
  }

  // No permission specified; render children
  return children;
}
```

Usage in components:

```javascript
function PostActions({ post }) {
  return (
    <div className="post-actions">
      {/* Anyone who can read posts sees the view button */}
      <Can permission="posts:read">
        <button onClick={() => viewPost(post.id)}>View</button>
      </Can>

      {/* Only users who can write posts see the edit button */}
      <Can permission="posts:write">
        <button onClick={() => editPost(post.id)}>Edit</button>
      </Can>

      {/* Only users who can delete posts see the delete button */}
      <Can permission="posts:delete">
        <button onClick={() => deletePost(post.id)}>Delete</button>
      </Can>

      {/* Publish requires both write and publish permissions */}
      <Can permissions={['posts:write', 'posts:publish']} requireAll={true}>
        <button onClick={() => publishPost(post.id)}>Publish</button>
      </Can>
    </div>
  );
}
```

### 10.5.3 Role-Based Route Configuration

Combine RBAC with the route guard pattern for route-level access control:

```javascript
const router = createBrowserRouter([
  // Public
  { path: '/login', element: <LoginPage /> },

  // Authenticated (any role)
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/profile', element: <ProfilePage /> },
    ],
  },

  // Editor and above
  {
    element: <ProtectedRoute requiredPermissions={['posts:write']} />,
    children: [
      { path: '/posts/new', element: <PostEditor /> },
      { path: '/posts/:id/edit', element: <PostEditor /> },
    ],
  },

  // Admin only
  {
    element: <ProtectedRoute requiredRole="admin" />,
    children: [
      { path: '/admin', element: <AdminDashboard /> },
      { path: '/admin/users', element: <UserManagement /> },
      { path: '/admin/settings', element: <AppSettings /> },
    ],
  },

  // Unauthorized fallback
  { path: '/unauthorized', element: <UnauthorizedPage /> },
]);
```

> **Common Mistake:** Relying solely on client-side RBAC for security. Client-side role checks control what the user sees, but they cannot prevent a determined attacker from calling API endpoints directly. Every permission check on the client must have a corresponding check on the server. Client-side RBAC is a UX optimization, not a security boundary.

---

## 10.6 Permission-Based Rendering

While RBAC assigns permissions through roles, permission-based rendering takes a more granular approach. Instead of checking "Is this user an admin?", it checks "Does this user have the `users:delete` permission?" This distinction becomes important in applications where roles are not rigid hierarchies but flexible combinations of capabilities.

### 10.6.1 Beyond Roles: Granular Permissions

In many real-world applications, roles are not sufficient. A project manager might need to read analytics and publish posts but not delete users. A content moderator might need to delete posts but not publish them. Permission-based rendering decouples the UI from the role structure, making the application more flexible.

```javascript
// The user object carries permissions directly, not just a role
const user = {
  id: 'user-42',
  name: 'Sarah Chen',
  role: 'content-moderator',
  permissions: [
    'posts:read',
    'posts:delete',
    'comments:read',
    'comments:delete',
    'users:read',
  ],
};
```

### 10.6.2 A Permission Hook

A custom hook provides a clean API for checking permissions anywhere in the component tree.

```javascript
import { useCallback } from 'react';
import { useAuth } from './AuthContext';

function usePermissions() {
  const { user } = useAuth();

  const can = useCallback(
    (permission) => {
      if (!user || !user.permissions) return false;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const canAny = useCallback(
    (permissions) => {
      if (!user || !user.permissions) return false;
      return permissions.some((p) => user.permissions.includes(p));
    },
    [user]
  );

  const canAll = useCallback(
    (permissions) => {
      if (!user || !user.permissions) return false;
      return permissions.every((p) => user.permissions.includes(p));
    },
    [user]
  );

  return { can, canAny, canAll };
}
```

Usage:

```javascript
function CommentSection({ postId }) {
  const { can } = usePermissions();
  const [comments, setComments] = useState([]);

  return (
    <section>
      <h3>Comments</h3>

      {comments.map((comment) => (
        <div key={comment.id} className="comment">
          <p>{comment.body}</p>
          <span>{comment.author}</span>

          {can('comments:delete') && (
            <button
              onClick={() => handleDeleteComment(comment.id)}
              aria-label={`Delete comment by ${comment.author}`}
            >
              Delete
            </button>
          )}
        </div>
      ))}

      {can('comments:write') && (
        <CommentForm postId={postId} onSubmit={handleAddComment} />
      )}
    </section>
  );
}
```

### 10.6.3 Declarative vs. Imperative Permission Checks

Both the `<Can>` component (declarative) and the `usePermissions` hook (imperative) have their place. Choose based on the context.

```javascript
// Declarative: best for rendering/hiding entire sections
function Sidebar() {
  return (
    <nav>
      <NavLink to="/">Dashboard</NavLink>
      <NavLink to="/posts">Posts</NavLink>

      <Can permission="analytics:read">
        <NavLink to="/analytics">Analytics</NavLink>
      </Can>

      <Can permission="settings:write">
        <NavLink to="/settings">Settings</NavLink>
      </Can>
    </nav>
  );
}

// Imperative: best when permission affects logic, not just rendering
function PostEditor({ post }) {
  const { can } = usePermissions();

  function handleSave() {
    if (can('posts:publish')) {
      // Save and publish in one step
      saveAndPublish(post);
    } else {
      // Save as draft, submit for review
      saveDraft(post);
    }
  }

  return (
    <form onSubmit={handleSave}>
      {/* ... editor fields ... */}
      <button type="submit">
        {can('posts:publish') ? 'Publish' : 'Save Draft'}
      </button>
    </form>
  );
}
```

### 10.6.4 Handling Permission Changes at Runtime

In collaborative applications, permissions might change while a user is actively using the app (e.g., an admin revokes a user's role). A robust system re-verifies permissions periodically or listens for server-sent events.

```javascript
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Periodically re-verify the user's permissions
  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (response.ok) {
          const freshUserData = await response.json();
          setUser(freshUserData);
        } else if (response.status === 401) {
          // Session expired or revoked
          setUser(null);
        }
      } catch (error) {
        // Network error; do not log out on transient failures
        console.error('Permission refresh failed:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(intervalId);
  }, [user]);

  // ... rest of provider ...
}
```

---

## 10.7 Secure Storage: Where to Put Tokens

Token storage is one of the most consequential decisions in a client-side auth architecture. Each storage mechanism has different security properties, and the choice depends on the application's threat model.

### 10.7.1 Storage Options Compared

```
+------------------+-----------+-----------+-------------------+
| Storage          | XSS Risk  | CSRF Risk | Persistence       |
+------------------+-----------+-----------+-------------------+
| In-memory (var)  | None      | None      | Lost on refresh   |
| localStorage     | HIGH      | None      | Persistent        |
| sessionStorage   | HIGH      | None      | Lost on tab close |
| HttpOnly cookie  | None      | Medium    | Configurable      |
| Memory + cookie  | Low       | Low       | Hybrid            |
+------------------+-----------+-----------+-------------------+
```

### 10.7.2 localStorage: Convenient but Vulnerable

localStorage is the most commonly used storage mechanism for JWTs in tutorials, but it is the least secure.

```javascript
// Storing a token in localStorage (common but insecure)
function loginWithLocalStorage(email, password) {
  return fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
    .then((res) => res.json())
    .then((data) => {
      localStorage.setItem('accessToken', data.accessToken);
      return data;
    });
}

// Any JavaScript running on the page can read this token
const stolenToken = localStorage.getItem('accessToken');
```

The fundamental problem: any JavaScript running on the page can read localStorage. If an attacker injects a script through an XSS vulnerability (e.g., via a compromised third-party package, a malicious ad, or unsanitized user input), they can exfiltrate the token and impersonate the user from any device.

### 10.7.3 HttpOnly Cookies: The Server-Side Approach

HttpOnly cookies cannot be accessed by client-side JavaScript. The browser automatically attaches them to every request to the cookie's domain.

```javascript
// Server-side: Set the token as an HttpOnly cookie
// (Express example for context)
app.post('/api/auth/login', async (req, res) => {
  const user = await verifyCredentials(req.body.email, req.body.password);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,   // JavaScript cannot access this cookie
    secure: true,     // Only sent over HTTPS
    sameSite: 'lax',  // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh', // Only sent to the refresh endpoint
  });

  res.json({ accessToken, user: { id: user.id, name: user.name } });
});
```

```javascript
// Client-side: the token is sent automatically; no manual management needed
async function fetchProtectedData() {
  const response = await fetch('/api/data', {
    credentials: 'include', // Tells the browser to send cookies
  });
  return response.json();
}
```

**CSRF mitigation with SameSite:** The `SameSite` cookie attribute controls whether the browser sends the cookie with cross-origin requests. `SameSite: 'lax'` allows the cookie to be sent with top-level navigation (following a link) but not with cross-origin POST requests, which is sufficient protection for most applications. `SameSite: 'strict'` prevents the cookie from being sent on any cross-origin request.

### 10.7.4 The Recommended Hybrid Approach

The most secure approach for SPAs combines in-memory storage for the access token with HttpOnly cookies for the refresh token.

```
Hybrid Token Storage:

  +---------------------+       +---------------------+
  | Access Token        |       | Refresh Token       |
  +---------------------+       +---------------------+
  | Stored: in memory   |       | Stored: HttpOnly    |
  |   (JavaScript var)  |       |   cookie            |
  | Lifetime: 5-15 min  |       | Lifetime: hours/days|
  | Sent: Authorization |       | Sent: automatically |
  |   header (manual)   |       |   by browser        |
  | XSS risk: Low       |       | XSS risk: None      |
  |   (memory only)     |       | CSRF risk: Low      |
  |                     |       |   (SameSite + path) |
  +---------------------+       +---------------------+

  On page refresh:
    1. Access token is lost (in-memory)
    2. App calls /api/auth/refresh
    3. Browser sends refresh token cookie automatically
    4. Server returns new access token
    5. App stores new access token in memory
```

```javascript
// Hybrid approach implementation in the Auth Provider
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      try {
        // On mount, attempt to get a new access token using the refresh cookie
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include', // Sends the HttpOnly refresh token cookie
        });

        if (response.ok) {
          const data = await response.json();
          // Store access token in memory only
          setAccessToken(data.accessToken);
          if (!cancelled) {
            setUser(data.user);
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();
    return () => { cancelled = true; };
  }, []);

  // ... login, logout, etc. ...
}
```

> **Common Mistake:** Storing refresh tokens in localStorage "because the access token is in memory." This defeats the purpose of the hybrid approach. If an attacker steals the refresh token via XSS, they can mint new access tokens indefinitely. The refresh token must be in an HttpOnly cookie, or the security benefit of keeping the access token in memory is lost.

### 10.7.5 Security Checklist for Token Storage

Regardless of the storage mechanism chosen, these practices should always be followed:

1. **Use HTTPS exclusively.** Tokens sent over HTTP can be intercepted by any network observer.
2. **Set short expiration times for access tokens.** Five to fifteen minutes is standard.
3. **Rotate refresh tokens on use.** When a refresh token is exchanged for a new access token, issue a new refresh token and invalidate the old one (refresh token rotation).
4. **Validate tokens server-side on every request.** Client-side checks are for UX; server-side checks are for security.
5. **Implement a logout endpoint that invalidates server-side state.** Clear the refresh token cookie and, if using JWTs, add the token to a server-side blocklist.
6. **Use `SameSite` and `Secure` cookie flags.** `SameSite: 'lax'` or `'strict'` prevents CSRF; `Secure` ensures the cookie is only sent over HTTPS.

---

## 10.8 Exercise: Build a Complete Auth System with Protected Routes and RBAC

### Problem Statement

Build a task management application with a complete authentication and authorization system. The application has four user roles with different permissions:

| Role | Permissions |
|---|---|
| Admin | Manage users, manage all tasks, view analytics, change settings |
| Manager | Create tasks, assign tasks to team members, view team analytics |
| Member | Create tasks, edit own tasks, view assigned tasks |
| Viewer | View tasks only (read-only access) |

The application must include:
1. An Auth Provider that manages login, logout, and session initialization
2. Protected routes that redirect unauthenticated users to a login page
3. Role-based route guards that restrict certain routes to specific roles
4. A `<Can>` component and `usePermissions` hook for granular permission checks
5. A simulated token refresh mechanism
6. Post-login redirect to the originally requested page

### Starter Code

```javascript
// permissions.js - Permission configuration (provided)
const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',
  ANALYTICS_READ: 'analytics:read',
  SETTINGS_WRITE: 'settings:write',
};

const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  manager: [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_WRITE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.ANALYTICS_READ,
  ],
  member: [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_WRITE,
  ],
  viewer: [
    PERMISSIONS.TASKS_READ,
  ],
};

export { PERMISSIONS, ROLE_PERMISSIONS };
```

```javascript
// mockApi.js - Simulated backend (provided)
const MOCK_USERS = [
  { id: '1', email: 'admin@example.com', password: 'admin', name: 'Alice Admin', role: 'admin' },
  { id: '2', email: 'manager@example.com', password: 'manager', name: 'Bob Manager', role: 'manager' },
  { id: '3', email: 'member@example.com', password: 'member', name: 'Carol Member', role: 'member' },
  { id: '4', email: 'viewer@example.com', password: 'viewer', name: 'Dave Viewer', role: 'viewer' },
];

let currentSession = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockLogin(email, password) {
  await delay(500); // Simulate network latency
  const user = MOCK_USERS.find((u) => u.email === email && u.password === password);
  if (!user) throw new Error('Invalid credentials');

  const { password: _, ...userWithoutPassword } = user;
  currentSession = {
    user: userWithoutPassword,
    accessToken: `mock-access-${Date.now()}`,
    expiresIn: 900, // 15 minutes
  };
  return currentSession;
}

async function mockRefresh() {
  await delay(200);
  if (!currentSession) throw new Error('No session');

  currentSession.accessToken = `mock-access-${Date.now()}`;
  return currentSession;
}

async function mockGetMe() {
  await delay(200);
  if (!currentSession) throw new Error('No session');
  return currentSession.user;
}

async function mockLogout() {
  await delay(200);
  currentSession = null;
}

export { mockLogin, mockRefresh, mockGetMe, mockLogout };
```

### Complete Solution

```javascript
// permissions.js
const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',
  ANALYTICS_READ: 'analytics:read',
  SETTINGS_WRITE: 'settings:write',
};

const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  manager: [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_WRITE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.ANALYTICS_READ,
  ],
  member: [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_WRITE,
  ],
  viewer: [
    PERMISSIONS.TASKS_READ,
  ],
};

// Resolve a user's permissions from their role
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

// Check if a role grants a specific permission
function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

export { PERMISSIONS, ROLE_PERMISSIONS, getPermissionsForRole, roleHasPermission };
```

```javascript
// AuthContext.js
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { mockLogin, mockRefresh, mockGetMe, mockLogout } from './mockApi';
import { getPermissionsForRole } from './permissions';

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Enrich the user object with resolved permissions
  function enrichUser(rawUser) {
    return {
      ...rawUser,
      permissions: getPermissionsForRole(rawUser.role),
    };
  }

  // On mount, check for an existing session
  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      try {
        // Attempt to refresh the session (simulates using a refresh token cookie)
        const sessionData = await mockRefresh();
        if (!cancelled) {
          setUser(enrichUser(sessionData.user));
        }
      } catch (error) {
        // No existing session; user must log in
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const sessionData = await mockLogin(email, password);
    const enrichedUser = enrichUser(sessionData.user);
    setUser(enrichedUser);
    return enrichedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await mockLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthProvider, useAuth };
```

```javascript
// usePermissions.js
import { useCallback } from 'react';
import { useAuth } from './AuthContext';

function usePermissions() {
  const { user } = useAuth();

  // Check a single permission
  const can = useCallback(
    (permission) => {
      if (!user || !user.permissions) return false;
      return user.permissions.includes(permission);
    },
    [user]
  );

  // Check if the user has at least one of the given permissions
  const canAny = useCallback(
    (permissions) => {
      if (!user || !user.permissions) return false;
      return permissions.some((p) => user.permissions.includes(p));
    },
    [user]
  );

  // Check if the user has all of the given permissions
  const canAll = useCallback(
    (permissions) => {
      if (!user || !user.permissions) return false;
      return permissions.every((p) => user.permissions.includes(p));
    },
    [user]
  );

  return { can, canAny, canAll };
}

export { usePermissions };
```

```javascript
// Can.js - Declarative permission component
import { usePermissions } from './usePermissions';

function Can({ permission, permissions, requireAll = true, fallback = null, children }) {
  const { can, canAll, canAny } = usePermissions();

  // Single permission check
  if (permission) {
    return can(permission) ? children : fallback;
  }

  // Multiple permissions check
  if (permissions) {
    const authorized = requireAll ? canAll(permissions) : canAny(permissions);
    return authorized ? children : fallback;
  }

  return children;
}

export { Can };
```

```javascript
// ProtectedRoute.js
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function ProtectedRoute({ requiredRole, requiredPermissions }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Phase 1: Loading (verifying session)
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <p>Verifying session...</p>
      </div>
    );
  }

  // Phase 2: Not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Phase 3: Authenticated but wrong role
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Phase 4: Authenticated but missing permissions
  if (requiredPermissions) {
    const hasRequired = requiredPermissions.every((p) =>
      user.permissions.includes(p)
    );
    if (!hasRequired) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // Phase 5: Authorized
  return <Outlet />;
}

export { ProtectedRoute };
```

```javascript
// LoginPage.js
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function LoginPage() {
  const { login, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect away
  const from = location.state?.from?.pathname || '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.target);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      await login(email, password);
      // Redirect to the page the user originally requested
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem' }}>
      <h1>Log In</h1>

      {error && (
        <div role="alert" style={{ color: 'red', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{ display: 'block', width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{ display: 'block', width: '100%' }}
          />
        </div>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>

      <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#666' }}>
        <p>Test accounts:</p>
        <ul>
          <li>admin@example.com / admin</li>
          <li>manager@example.com / manager</li>
          <li>member@example.com / member</li>
          <li>viewer@example.com / viewer</li>
        </ul>
      </div>
    </div>
  );
}

export { LoginPage };
```

```javascript
// App.js - Putting it all together
import { createBrowserRouter, RouterProvider, Link, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { Can } from './Can';
import { usePermissions } from './usePermissions';
import { PERMISSIONS } from './permissions';
import { LoginPage } from './LoginPage';

// --- Layout Components ---

function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
        <nav>
          <Link to="/">Dashboard</Link>
          {' | '}
          <Link to="/tasks">Tasks</Link>

          <Can permission={PERMISSIONS.ANALYTICS_READ}>
            {' | '}
            <Link to="/analytics">Analytics</Link>
          </Can>

          <Can permission={PERMISSIONS.USERS_READ}>
            {' | '}
            <Link to="/admin/users">Users</Link>
          </Can>

          <Can permission={PERMISSIONS.SETTINGS_WRITE}>
            {' | '}
            <Link to="/admin/settings">Settings</Link>
          </Can>
        </nav>

        <div>
          <span>
            {user.name} ({user.role})
          </span>
          {' '}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={{ padding: '1rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

// --- Page Components ---

function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user.name}. Your role: {user.role}</p>
    </div>
  );
}

function TasksPage() {
  const { can } = usePermissions();

  const tasks = [
    { id: 1, title: 'Design landing page', assignee: 'Carol', status: 'in-progress' },
    { id: 2, title: 'Fix navigation bug', assignee: 'Bob', status: 'todo' },
    { id: 3, title: 'Write API documentation', assignee: 'Carol', status: 'done' },
  ];

  return (
    <div>
      <h1>Tasks</h1>

      {can(PERMISSIONS.TASKS_WRITE) && (
        <button style={{ marginBottom: '1rem' }}>Create Task</button>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.title}</td>
              <td>{task.assignee}</td>
              <td>{task.status}</td>
              <td>
                {can(PERMISSIONS.TASKS_WRITE) && <button>Edit</button>}
                {' '}
                {can(PERMISSIONS.TASKS_DELETE) && <button>Delete</button>}
                {' '}
                {can(PERMISSIONS.TASKS_ASSIGN) && <button>Reassign</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsPage() {
  return (
    <div>
      <h1>Analytics</h1>
      <p>Task completion rate: 67%</p>
      <p>Active team members: 4</p>
    </div>
  );
}

function UserManagementPage() {
  return (
    <div>
      <h1>User Management</h1>
      <p>Admin-only: manage users, roles, and permissions.</p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <p>Admin-only: application configuration.</p>
    </div>
  );
}

function UnauthorizedPage() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <h1>403: Unauthorized</h1>
      <p>You do not have permission to access this page.</p>
      <Link to="/">Return to Dashboard</Link>
    </div>
  );
}

// --- Router Configuration ---

const router = createBrowserRouter([
  // Public routes
  { path: '/login', element: <LoginPage /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },

  // Authenticated routes (any role)
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/tasks', element: <TasksPage /> },
        ],
      },
    ],
  },

  // Manager and above (need analytics:read)
  {
    element: <ProtectedRoute requiredPermissions={[PERMISSIONS.ANALYTICS_READ]} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/analytics', element: <AnalyticsPage /> },
        ],
      },
    ],
  },

  // Admin only
  {
    element: <ProtectedRoute requiredRole="admin" />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/admin/users', element: <UserManagementPage /> },
          { path: '/admin/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);

// --- Root Component ---

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
```

### Key Takeaway

A production-quality auth system in React is composed of several cooperating layers: an Auth Provider for centralized state management, route guards for page-level access control, and permission components/hooks for element-level rendering decisions. Each layer serves a distinct purpose. The Auth Provider manages identity; route guards enforce coarse access rules at the navigation level; and the `<Can>` component and `usePermissions` hook provide fine-grained control over individual UI elements. Critically, all client-side checks are UX optimizations. The server must independently enforce every permission on every request, because client-side code can always be bypassed.

---

## Chapter Summary

Authentication and authorization are distinct concerns that require different implementation strategies. Authentication verifies identity through mechanisms like sessions, JWTs, or OAuth with PKCE, each with different trade-offs around statefulness, revocability, and complexity. Authorization controls what authenticated users can do, implemented through role-based access control at the route level and permission-based rendering at the component level. Token storage demands careful evaluation: the hybrid approach (access tokens in memory, refresh tokens in HttpOnly cookies) provides the strongest defense against both XSS and CSRF attacks. Throughout the entire system, the cardinal rule holds: client-side checks improve user experience, but the server must be the final authority on every permission decision.

## Further Reading

- [OAuth 2.0 for Browser-Based Applications (RFC Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps) for the authoritative guidance on OAuth in SPAs
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) for comprehensive server-side authentication best practices
- [React Router Documentation on Auth](https://reactrouter.com/en/main/start/tutorial#auth) for official patterns on protected routes
- [The Developer's Guide to JWT Storage](https://www.descope.com/blog/post/developer-guide-jwt-storage) for an in-depth comparison of token storage mechanisms
- [JWT Storage in React: Local Storage vs Cookies Security Battle](https://cybersierra.co/blog/react-jwt-storage-guide/) for practical security analysis of storage options
- [TanStack Router Authentication Guide](https://tanstack.com/router/v1/docs/framework/react/how-to/setup-authentication) for authentication patterns in TanStack Router
