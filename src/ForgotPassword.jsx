import { useState } from "react";

export default function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Email is required"); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Enter a valid email"); return; }
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
    } catch {
      setError("Cannot connect to server. Make sure backend is running.");
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={s.header}>
          <div style={s.logo}>🔐</div>
          <h1 style={s.title}>Forgot password?</h1>
          <p style={s.subtitle}>Enter your email and we'll send you a reset link</p>
        </div>

        {success ? (
          <div style={s.successBox}>
            <div style={s.successIcon}>📧</div>
            <h3 style={s.successTitle}>Check your email!</h3>
            <p style={s.successText}>We sent a password reset link to <strong>{email}</strong>. It expires in 15 minutes.</p>
            <button style={s.backBtn} onClick={onBack} type="button">← Back to Login</button>
          </div>
        ) : (
          <>
            {error && <div style={s.errorBox}>⚠ {error}</div>}
            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <div style={s.wrap}>
                <span style={s.icon}>✉</span>
                <input
                  style={{ ...s.input, borderColor: error ? "#ef4444" : "#e2e8f0" }}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
            </div>
            <button
              style={{ ...s.btn, opacity: isLoading ? 0.75 : 1 }}
              onClick={handleSubmit}
              disabled={isLoading}
              type="button"
            >
              {isLoading ? "Sending…" : "SEND RESET LINK"}
            </button>
            <p style={s.switch}>
              Remember your password?{" "}
              <button style={s.link} onClick={onBack} type="button">Sign In</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  header: { textAlign: "center", marginBottom: "28px" },
  logo: { width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #f41b1b, #090df5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px", boxShadow: "0 8px 20px rgba(102,126,234,0.35)" },
  title: { margin: "0 0 6px", fontSize: "26px", fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: 0, fontSize: "14px", color: "#718096" },
  errorBox: { background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", color: "#c53030", fontSize: "14px" },
  field: { marginBottom: "20px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "#4a5568", marginBottom: "7px" },
  wrap: { position: "relative" },
  icon: { position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none", opacity: 0.45 },
  input: { width: "100%", padding: "12px 14px 12px 42px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "15px", color: "#1a202c", outline: "none", boxSizing: "border-box", background: "#fafafa" },
  btn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #f41b1b, #090df5)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700, letterSpacing: "1px", cursor: "pointer", boxShadow: "0 8px 20px rgba(102,126,234,0.35)", marginBottom: "20px" },
  switch: { textAlign: "center", fontSize: "14px", color: "#718096", margin: 0 },
  link: { background: "none", border: "none", color: "#667eea", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: "14px", textDecoration: "underline" },
  successBox: { textAlign: "center", padding: "8px 0" },
  successIcon: { fontSize: "48px", marginBottom: "16px" },
  successTitle: { fontSize: "20px", fontWeight: 700, color: "#1a202c", margin: "0 0 8px" },
  successText: { fontSize: "14px", color: "#718096", margin: "0 0 24px", lineHeight: 1.6 },
  backBtn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #f41b1b, #090df5)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" },
};