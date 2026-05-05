import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Gate from "@/pages/Gate";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import NewPost from "@/pages/NewPost";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import AppShell from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-dim)] fp-mono text-xs uppercase tracking-[0.4em]">Loading.</div>;
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return null;
  if (user) return <Navigate to="/feed" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PublicOnly><Gate /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

            <Route element={<Protected><AppShell /></Protected>}>
              <Route path="/feed" element={<Feed />} />
              <Route path="/post/new" element={<NewPost />} />
              <Route path="/post/:id" element={<PostDetail />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:convId" element={<Messages />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: { background: "#111", border: "1px solid #2A2A2A", color: "#F5F5F5", borderRadius: 0 },
          }}
        />
      </AuthProvider>
    </div>
  );
}
