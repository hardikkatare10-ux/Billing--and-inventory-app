import { useState } from "react";
import { ArrowRight, Lock, RefreshCcw, Store } from "lucide-react";

export interface AuthSessionUser {
  username: string;
  shopName: string;
  phone: string;
}

type AuthMode = "login" | "register" | "forgot";

const env = (import.meta as any).env as { VITE_API_BASE?: string; DEV?: boolean };
const API_BASE = env.VITE_API_BASE || (env.DEV ? "http://localhost:4000/api" : "/api");

async function postJson(path: string, body: Record<string, unknown>) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("Unable to connect to the auth backend. Start the backend server at http://localhost:4000 and reload.");
  }

  const text = await response.text();
  const trimmed = text.trim();
  let data: any = null;

  if (trimmed) {
    const isHtml = trimmed.startsWith("<") && /<html|<!doctype html/i.test(trimmed);
    if (isHtml) {
      if (!response.ok) {
        throw new Error("Backend returned HTML instead of JSON. Ensure the auth backend is running and /api proxy is configured.");
      }
      throw new Error("Server returned HTML instead of JSON. Check backend configuration.");
    }

    try {
      data = JSON.parse(trimmed);
    } catch {
      if (!response.ok) {
        throw new Error(`Server returned invalid JSON: ${trimmed.slice(0, 120)}`);
      }
      throw new Error("Server returned invalid JSON.");
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status} ${response.statusText}`);
  }

  return data;
}

const isValidPassword = (value: string) => /^682\d+$/.test(value);

export default function AuthScreen({ onAuthSuccess }: { onAuthSuccess: (user: AuthSessionUser) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    shopName: "",
    phone: "",
    password: "",
    confirmPassword: "",
    newPassword: "",
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setForm({ username: "", shopName: "", phone: "", password: "", confirmPassword: "", newPassword: "" });
  };

  const handleLogin = async () => {
    if (!form.username.trim() || !form.password) {
      setError("Enter both username and password.");
      return;
    }

    try {
      setLoading(true);
      const data = await postJson("/auth/login", {
        username: form.username.trim(),
        password: form.password,
      });
      onAuthSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!form.username.trim() || !form.shopName.trim() || !form.phone.trim() || !form.password) {
      setError("Fill all required fields to register.");
      return;
    }
    if (!isValidPassword(form.password)) {
      setError("Password must start with 682 and contain only digits.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Password and confirmation must match.");
      return;
    }

    try {
      setLoading(true);
      const data = await postJson("/auth/register", {
        username: form.username.trim(),
        shopName: form.shopName.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      onAuthSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!form.username.trim() || !form.shopName.trim() || !form.phone.trim() || !form.newPassword) {
      setError("Fill all required fields to reset password.");
      return;
    }
    if (!isValidPassword(form.newPassword)) {
      setError("New password must start with 682 and contain only digits.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }

    try {
      setLoading(true);
      await postJson("/auth/forgot-password", {
        username: form.username.trim(),
        shopName: form.shopName.trim(),
        phone: form.phone.trim(),
        newPassword: form.newPassword,
      });
      setMessage("Password updated successfully. Please login with your new password.");
      switchMode("login");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderFields = () => {
    if (mode === "login") {
      return (
        <>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
            <input value={form.username} onChange={(e) => updateField("username", e.target.value)} placeholder="Your username"
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} placeholder="Password"
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </>
      );
    }

    const sharedFields = (
      <>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
          <input value={form.username} onChange={(e) => updateField("username", e.target.value)} placeholder="Create a unique username"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Shop Name</label>
          <input value={form.shopName} onChange={(e) => updateField("shopName", e.target.value)} placeholder="Your shop name"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Phone Number</label>
          <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="10-digit phone number"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </>
    );

    return (
      <>
        {sharedFields}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{mode === "register" ? "Password" : "New Password"}</label>
          <input type="password" value={mode === "register" ? form.password : form.newPassword}
            onChange={(e) => updateField(mode === "register" ? "password" : "newPassword", e.target.value)} placeholder="Enter password"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm Password</label>
          <input type="password" value={form.confirmPassword} onChange={(e) => updateField("confirmPassword", e.target.value)} placeholder="Confirm password"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </>
    );
  };

  const submitLabel = mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Reset Password";

  return (
    <div className="min-h-screen bg-[#0f2557] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-[#1e40af] to-[#0f2557] p-8 text-white text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#f59e0b] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Bill Pilot Cloud Auth</h1>
          <p className="text-blue-200 text-sm mt-1">Secure registration, login, and password reset with cloud persistence.</p>
        </div>

        <div className="p-7 space-y-5">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <button type="button" onClick={() => switchMode("login")}
              className={`w-full text-left px-3 py-2 rounded-xl ${mode === "login" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"}`}>
              <div className="flex items-center justify-between">
                <span>Login</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
            <button type="button" onClick={() => switchMode("register")}
              className={`w-full text-left px-3 py-2 rounded-xl ${mode === "register" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"}`}>
              <div className="flex items-center justify-between">
                <span>Register</span>
                <Lock className="w-4 h-4" />
              </div>
            </button>
            <button type="button" onClick={() => switchMode("forgot")}
              className={`w-full text-left px-3 py-2 rounded-xl ${mode === "forgot" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"}`}>
              <div className="flex items-center justify-between">
                <span>Forgot Password</span>
                <RefreshCcw className="w-4 h-4" />
              </div>
            </button>
          </div>

          <div className="space-y-4">
            {renderFields()}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {message && <p className="text-xs text-emerald-600">{message}</p>}

          <button onClick={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword}
            disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Working..." : submitLabel}
          </button>

          {mode !== "login" && (
            <button type="button" onClick={() => switchMode("login")}
              className="w-full py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
              Back to login
            </button>
          )}

          <div className="text-xs text-muted-foreground px-3 pt-2">
            <p>No OTP. No email verification. Cloud-based auth and session cookies keep you logged in across reloads.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
