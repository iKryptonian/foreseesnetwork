import { useState } from "react";

export default function Login({ onNavigateToRegister, onLoginSuccess, onForgotPassword, appDB }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    return e;
  };

  const handleLogin = async () => {
  const errs = validate();
  if (Object.keys(errs).length > 0) { setErrors(errs); return; }
  setIsLoading(true);
  setErrors({});

  try {
    const res = await fetch("http://localhost:4000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrors({ [data.field]: data.message });
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    if (onLoginSuccess) onLoginSuccess(data.user);
  } catch {
    setErrors({ global: "Cannot connect to server. Make sure backend is running." });
    setIsLoading(false);
  }
};

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={s.header}>
          <div style={s.logoMark}>💬</div>
          <h1 style={s.title}>Welcome back</h1>
          <p style={s.subtitle}>Sign in to ForeseesNetwork</p>
        </div>
        {errors.global && <div style={s.globalError}>⚠ {errors.global}</div>}
        <div style={s.field}>
          <label style={s.label}>Email</label>
          <div style={s.inputWrap}>
            <span style={s.icon}>✉</span>
            <input style={{ ...s.input, borderColor: errors.email ? "#ef4444" : "#e2e8f0" }} type="email" placeholder="you@example.com" value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined, global: undefined })); }} />
          </div>
          {errors.email && <p style={s.err}>{errors.email}</p>}
        </div>
        <div style={s.field}>
          <label style={s.label}>Password</label>
          <div style={s.inputWrap}>
            <span style={s.icon}>🔒</span>
            <input style={{ ...s.input, borderColor: errors.password ? "#ef4444" : "#e2e8f0", paddingRight: "48px" }} type={showPassword ? "text" : "password"} placeholder="Your password" value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} />
            <button style={s.eye} onClick={() => setShowPassword((v) => !v)} type="button">{showPassword ? "🙈" : "👁"}</button>
          </div>
          {errors.password && <p style={s.err}>{errors.password}</p>}
        </div>
        <div style={s.row}>
          <label style={s.checkLabel}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: "#f5576c" }} /><span style={{ fontSize: "13px", color: "#4a5568" }}>Remember me</span></label>
          <button style={s.forgot} type="button" onClick={onForgotPassword}>Forgot password?</button>
        </div>
        <button style={{ ...s.btn, opacity: isLoading ? 0.75 : 1 }} onClick={handleLogin} disabled={isLoading} type="button">
          {isLoading ? "Signing in…" : "LOGIN"}
        </button>
        <p style={s.switch}>Need an account? <button style={s.switchBtn} onClick={onNavigateToRegister} type="button">SIGN UP</button></p>
      </div>
    </div>
  );
}

const s = {
  header: { textAlign: "center", marginBottom: "32px" },
  logoMark: { width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #f41b1b, #090df5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px", boxShadow: "0 8px 20px rgba(245,87,108,0.35)" },
  title: { margin: "0 0 6px", fontSize: "26px", fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: 0, fontSize: "14px", color: "#718096" },
  globalError: { background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", color: "#c53030", fontSize: "14px" },
  field: { marginBottom: "20px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "#4a5568", marginBottom: "8px" },
  inputWrap: { position: "relative" },
  icon: { position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none", opacity: 0.45 },
  input: { width: "100%", padding: "12px 14px 12px 42px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "15px", color: "#1a202c", outline: "none", boxSizing: "border-box", background: "#fafafa" },
  eye: { position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: 0.5, padding: "4px" },
  err: { margin: "6px 0 0", fontSize: "12px", color: "#ef4444" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" },
  checkLabel: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  forgot: { background: "none", border: "none", color: "#667eea", fontSize: "13px", cursor: "pointer", padding: 0 },
  btn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #f41b1b, #090df5)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700, letterSpacing: "1px", cursor: "pointer", boxShadow: "0 8px 20px rgba(245,87,108,0.35)", marginBottom: "20px" },
  switch: { textAlign: "center", fontSize: "14px", color: "#718096", margin: 0 },
  switchBtn: { background: "none", border: "none", color: "#f5576c", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: "14px", textDecoration: "underline" },
};
