import { useState } from "react";

export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const getStrength = (p) => {
    if (!p) return 0;
    let n = 0;
    if (p.length >= 6) n++;
    if (p.length >= 10) n++;
    if (/[A-Z]/.test(p)) n++;
    if (/[0-9]/.test(p)) n++;
    if (/[^a-zA-Z0-9]/.test(p)) n++;
    return n;
  };
  const sLabels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const sColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];
  const strength = getStrength(password);

  const handleReset = async () => {
    if (!password) { setError("Password is required"); return; }
    if (password.length < 6) { setError("At least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
      setTimeout(() => onDone(), 2000);
    } catch {
      setError("Cannot connect to server. Make sure backend is running.");
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={s.header}>
          <div style={s.logo}>🔑</div>
          <h1 style={s.title}>Reset password</h1>
          <p style={s.subtitle}>Enter your new password below</p>
        </div>

        {success ? (
          <div style={s.successBox}>
            <div style={s.successIcon}>✅</div>
            <h3 style={s.successTitle}>Password reset!</h3>
            <p style={s.successText}>Your password has been updated successfully. Redirecting to login…</p>
          </div>
        ) : (
          <>
            {error && <div style={s.errorBox}>⚠ {error}</div>}

            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <div style={s.wrap}>
                <span style={s.icon}>🔒</span>
                <input
                  style={{ ...s.input, paddingRight: "48px" }}
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                />
                <button style={s.eye} onClick={() => setShowPassword((v) => !v)} type="button">
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
              {password && (
                <div style={s.strengthRow}>
                  <div style={s.bars}>
                    {[1,2,3,4,5].map((i) => (
                      <div key={i} style={{ ...s.bar, background: i <= strength ? sColors[strength] : "#e2e8f0" }} />
                    ))}
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: sColors[strength] }}>{sLabels[strength]}</span>
                </div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>Confirm New Password</label>
              <div style={s.wrap}>
                <span style={s.icon}>🔑</span>
                <input
                  style={{ ...s.input, paddingRight: "48px" }}
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                />
              </div>
            </div>

            <button
              style={{ ...s.btn, opacity: isLoading ? 0.75 : 1 }}
              onClick={handleReset}
              disabled={isLoading}
              type="button"
            >
              {isLoading ? "Resetting…" : "RESET PASSWORD"}
            </button>
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
  eye: { position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: 0.5, padding: "4px" },
  strengthRow: { display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" },
  bars: { display: "flex", gap: "4px", flex: 1 },
  bar: { flex: 1, height: "4px", borderRadius: "2px", transition: "background 0.3s" },
  btn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #f41b1b, #090df5)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700, letterSpacing: "1px", cursor: "pointer", boxShadow: "0 8px 20px rgba(102,126,234,0.35)", marginBottom: "20px" },
  successBox: { textAlign: "center", padding: "8px 0" },
  successIcon: { fontSize: "48px", marginBottom: "16px" },
  successTitle: { fontSize: "20px", fontWeight: 700, color: "#1a202c", margin: "0 0 8px" },
  successText: { fontSize: "14px", color: "#718096", margin: "0 0 24px", lineHeight: 1.6 },
};