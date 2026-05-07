import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Gate from "@/pages/Gate";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import PendingReview from "@/pages/PendingReview";
import Rejected from "@/pages/Rejected";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import NewPost from "@/pages/NewPost";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import Pillars from "@/pages/Pillars";
import Admin from "@/pages/Admin";
import AppShell from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import MessageNotifier from "@/components/MessageNotifier";
import InstallPrompt from "@/components/InstallPrompt";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-[var(--text-mute)] fp-mono text-xs uppercase tracking-[0.4em]">
      Loading.
    </div>
  );
}

function StatusGate({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/" replace />;
  if (user.status === "pending_email") return <Navigate to="/verify" replace />;
  if (user.status === "pending_review") return <Navigate to="/pending" replace />;
  if (user.status === "rejected") return <Navigate to="/rejected" replace />;
  return children;
}

function StageOnly({ stage, children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/" replace />;
  if (user.status !== stage) {
    if (user.status === "active") return <Navigate to="/feed" replace />;
    if (user.status === "pending_email") return <Navigate to="/verify" replace />;
    if (user.status === "pending_review") return <Navigate to="/pending" replace />;
    if (user.status === "rejected") return <Navigate to="/rejected" replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return null;
  if (user) {
    if (user.status === "pending_email") return <Navigate to="/verify" replace />;
    if (user.status === "pending_review") return <Navigate to="/pending" replace />;
    if (user.status === "rejected") return <Navigate to="/rejected" replace />;
    return <Navigate to="/feed" replace />;
  }
  return children;
}

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user || !user.is_admin) return <Navigate to="/feed" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <InstallPrompt />
          <MessageNotifier />
          <Routes>
            <Route path="/" element={<PublicOnly><Gate /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/forgot" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
            <Route path="/reset/:token" element={<PublicOnly><ResetPassword /></PublicOnly>} />

            <Route path="/verify" element={<StageOnly stage="pending_email"><VerifyEmail /></StageOnly>} />
            <Route path="/pending" element={<StageOnly stage="pending_review"><PendingReview /></StageOnly>} />
            <Route path="/rejected" element={<StageOnly stage="rejected"><Rejected /></StageOnly>} />

            <Route element={<StatusGate><AppShell /></StatusGate>}>
              <Route path="/feed" element={<Feed />} />
              <Route path="/pillars" element={<Pillars />} />
              <Route path="/champions" element={<Pillars />} />
              <Route path="/post/new" element={<NewPost />} />
              <Route path="/post/:id" element={<PostDetail />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:convId" element={<Messages />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<AdminOnly><Admin /></AdminOnly>} />
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
