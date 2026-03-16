import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import Home from "./pages/Home";
import Lesson from "./pages/Lesson";

export default function App() {
  return (
    <ThemeProvider>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lesson/:slug" element={<Lesson />} />
      </Routes>
    </ThemeProvider>
  );
}
