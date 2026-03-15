import { useState, useRef } from "react";

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export default function Register({ onNavigateToLogin, onRegisterSuccess, appDB }) {
  const [step, setStep] = useState("form");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const cooldownRef = useRef(null);
  const passwordRef = useRef("");
  passwordRef.current = password;

  const db = appDB || { users: [] };

  const vUser = (v) => {
    if (!v.trim()) return "Username is required";
    if (v.includes(" ")) return "Spaces are not allowed";
    if (v.length < 3) return "At least 3 characters";
    if (v.length > 22) return "Maximum 22 characters allowed";
    if (!/^[a-zA-Z0-9_.]+$/.test(v)) return "Only letters, numbers, _ and . allowed";
    if (v.startsWith(".")) return "Username cannot start with a dot";
    if (v.endsWith(".")) return "Username cannot end with a dot";
    if (db.users.some((u) => u.username.toLowerCase() === v.toLowerCase())) return "Username already taken — choose another";
    return "";
  };
  const vEmail = (v) => {
    if (!v.trim()) return "Email is required";
    if (!/\S+@\S+\.\S+/.test(v)) return "Enter a valid email";
    if (db.users.some((u) => u.email.toLowerCase() === v.toLowerCase())) return "Email already registered — user already exists";
    return "";
  };
  const vPass = (v) => { if (!v) return "Password is required"; if (v.length < 6) return "At least 6 characters"; return ""; };
  const vConfirm = (v, p) => { if (!v) return "Please confirm password"; if (v !== p) return "Passwords do not match"; return ""; };

  const sendOtp = async () => {
  try {
    const res = await fetch("http://localhost:4000/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username }),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrors((p) => ({ ...p, [data.field]: data.message }));
      return;
    }

    setGeneratedOtp(data.otp);
    setStep("otp"); // ← move here, only after OTP received
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError("");

    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((p) => { if (p <= 1) { clearInterval(cooldownRef.current); return 0; } return p - 1; });
    }, 1000);

  } catch {
    setErrors((p) => ({ ...p, global: "Cannot connect to server." }));
  }
};

  const handleRegister = async () => {
    const e = { username: vUser(username), email: vEmail(email), password: vPass(password), confirmPassword: vConfirm(confirmPassword, password) };
    setErrors(e);
    if (e.username || e.email || e.password || e.confirmPassword) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    await sendOtp(); // ← await here
    setIsLoading(false);
  };

  const handleOtpChange = (i, value) => {
    if (!/^\d*$/.test(value)) return;
    const d = [...otpDigits]; d[i] = value.slice(-1); setOtpDigits(d); setOtpError("");
    if (value && i < 5) otpRefs[i + 1].current?.focus();
  };
  const handleOtpKey = (i, e) => { if (e.key === "Backspace" && !otpDigits[i] && i > 0) otpRefs[i - 1].current?.focus(); };
  const handlePaste = (e) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) { setOtpDigits(p.split("")); otpRefs[5].current?.focus(); }
    e.preventDefault();
  };

  const handleVerify = async () => {
  const entered = otpDigits.join("");
  if (entered.length < 6) { setOtpError("Enter all 6 digits"); return; }
  setVerifying(true);

  if (entered !== generatedOtp) {
    setOtpError("Incorrect OTP. Try again.");
    setVerifying(false);
    return;
  }

  try {
    const res = await fetch("http://localhost:4000/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setOtpError(data.message);
      setVerifying(false);
      return;
    }

    setVerifying(false);
    if (onRegisterSuccess) onRegisterSuccess(data.user);
  } catch {
    setOtpError("Cannot connect to server. Make sure backend is running.");
    setVerifying(false);
  }
};

  const getStrength = (p) => { if (!p) return 0; let n = 0; if (p.length >= 6) n++; if (p.length >= 10) n++; if (/[A-Z]/.test(p)) n++; if (/[0-9]/.test(p)) n++; if (/[^a-zA-Z0-9]/.test(p)) n++; return n; };
  const sLabels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const sColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];
  const strength = getStrength(password);
  const bColor = (field, val) => { if (errors[field]) return "#ef4444"; if (val && errors[field] === "") return "#22c55e"; return "#e2e8f0"; };

  if (step === "otp") return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={s.header}>
          <div style={{ ...s.logo, background: "linear-gradient(135deg, #f093fb, #f5576c)" }}>📧</div>
          <h1 style={s.title}>Verify your email</h1>
          <p style={s.subtitle}>We sent a 6-digit code to</p>
          <p style={{ ...s.subtitle, fontWeight: 600, color: "#4a5568", marginTop: "4px" }}>{email}</p>
        </div>
        {otpSuccess && <div style={s.success}>✅ Verified! Welcome, {username} 🎉</div>}
        {!otpSuccess && <>
          <div style={s.otpRow}>
            {otpDigits.map((d, i) => (
              <input key={i} ref={otpRefs[i]} style={{ ...s.otpBox, borderColor: otpError ? "#ef4444" : d ? "#667eea" : "#e2e8f0", background: d ? "#f0f4ff" : "#fafafa" }}
                type="text" inputMode="numeric" maxLength={1} value={d}
                onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKey(i, e)}
                onPaste={i === 0 ? handlePaste : undefined} autoFocus={i === 0} />
            ))}
          </div>
          {otpError && <p style={{ ...s.err, textAlign: "center", marginBottom: "12px" }}>⚠ {otpError}</p>}
          <button style={{ ...s.btn, background: "linear-gradient(135deg, #f093fb, #f5576c)", opacity: verifying ? 0.75 : 1 }} onClick={handleVerify} disabled={verifying} type="button">
            {verifying ? "Verifying…" : "VERIFY OTP"}
          </button>
          <p style={{ textAlign: "center", fontSize: "13px", color: "#718096", marginBottom: "12px" }}>
            Didn't receive it?{" "}
            {resendCooldown > 0 ? <span style={{ color: "#a0aec0" }}>Resend in {resendCooldown}s</span>
              : <button style={s.link} onClick={() => { sendOtp(); setOtpDigits(["","","","","",""]); setOtpError(""); }} type="button">Resend OTP</button>}
          </p>
          <p style={{ textAlign: "center" }}>
            <button style={{ ...s.link, color: "#718096", fontSize: "13px" }} onClick={() => setStep("form")} type="button">← Go back</button>
          </p>
        </>}
      </div>
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={s.header}>
          <div style={s.logo}>💬</div>
          <h1 style={s.title}>Create account</h1>
          <p style={s.subtitle}>Join ForeseesNetwork today</p>
        </div>

        <div style={s.field}>
          <label style={s.label}>Username <span style={{ float: "right", fontWeight: 400, color: username.length > 22 ? "#ef4444" : "rgba(0,0,0,0.35)" }}>{username.length}/22</span></label>
          <div style={s.wrap}>
            <span style={s.icon}>@</span>
            <input style={{ ...s.input, borderColor: bColor("username", username) }} type="text" placeholder="unique_username" value={username}
              onChange={(e) => { const v = e.target.value.replace(/\s/g, ""); setUsername(v); setErrors((p) => ({ ...p, username: vUser(v) })); }} />
            {username && errors.username === "" && <span style={s.check}>✓</span>}
          </div>
          {errors.username ? <p style={s.err}>⚠ {errors.username}</p> : username && errors.username === "" ? <p style={s.ok}>✓ Username available</p> : null}
        </div>

        <div style={s.field}>
          <label style={s.label}>Email</label>
          <div style={s.wrap}>
            <span style={s.icon}>✉</span>
            <input style={{ ...s.input, borderColor: bColor("email", email) }} type="email" placeholder="you@example.com" value={email}
              onChange={(e) => { const v = e.target.value; setEmail(v); setErrors((p) => ({ ...p, email: vEmail(v) })); }} />
            {email && errors.email === "" && <span style={s.check}>✓</span>}
          </div>
          {errors.email && <p style={s.err}>⚠ {errors.email}</p>}
        </div>

        <div style={s.field}>
          <label style={s.label}>Password</label>
          <div style={s.wrap}>
            <span style={s.icon}>🔒</span>
            <input style={{ ...s.input, borderColor: errors.password ? "#ef4444" : "#e2e8f0", paddingRight: "48px" }} type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password}
              onChange={(e) => { const v = e.target.value; setPassword(v); setErrors((p) => ({ ...p, password: vPass(v), confirmPassword: confirmPassword ? vConfirm(confirmPassword, v) : p.confirmPassword })); }} />
            <button style={s.eye} onClick={() => setShowPassword((v) => !v)} type="button">{showPassword ? "🙈" : "👁"}</button>
          </div>
          {errors.password && <p style={s.err}>⚠ {errors.password}</p>}
          {password && <div style={s.strengthRow}><div style={s.bars}>{[1,2,3,4,5].map((i) => <div key={i} style={{ ...s.bar, background: i <= strength ? sColors[strength] : "#e2e8f0" }} />)}</div><span style={{ fontSize: "12px", fontWeight: 600, color: sColors[strength] }}>{sLabels[strength]}</span></div>}
        </div>

        <div style={s.field}>
          <label style={s.label}>Confirm Password</label>
          <div style={s.wrap}>
            <span style={s.icon}>🔑</span>
            <input style={{ ...s.input, borderColor: bColor("confirmPassword", confirmPassword), paddingRight: "48px" }} type={showPassword ? "text" : "password"} placeholder="Repeat password" value={confirmPassword}
              onChange={(e) => { const v = e.target.value; setConfirmPassword(v); setErrors((p) => ({ ...p, confirmPassword: vConfirm(v, passwordRef.current) })); }} />
            {confirmPassword && errors.confirmPassword === "" && <span style={s.check}>✓</span>}
          </div>
          {errors.confirmPassword && <p style={s.err}>⚠ {errors.confirmPassword}</p>}
        </div>

        <button style={{ ...s.btn, opacity: isLoading ? 0.75 : 1 }} onClick={handleRegister} disabled={isLoading} type="button">
          {isLoading ? "Sending OTP…" : "CREATE ACCOUNT"}
        </button>
        <p style={s.switch}>Already have an account? <button style={s.link} onClick={onNavigateToLogin} type="button">SIGN IN</button></p>
      </div>
    </div>
  );
}

const s = {
  header: { textAlign: "center", marginBottom: "28px" },
  logo: { width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #f41b1b, #090df5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px", boxShadow: "0 8px 20px rgba(102,126,234,0.35)" },
  title: { margin: "0 0 6px", fontSize: "26px", fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: 0, fontSize: "14px", color: "#718096" },
  success: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", color: "#166534", fontSize: "14px", fontWeight: 500 },
  field: { marginBottom: "18px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "#4a5568", marginBottom: "7px" },
  wrap: { position: "relative" },
  icon: { position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none", opacity: 0.45 },
  input: { width: "100%", padding: "12px 14px 12px 42px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "15px", color: "#1a202c", outline: "none", boxSizing: "border-box", background: "#fafafa", transition: "border-color 0.2s" },
  eye: { position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: 0.5, padding: "4px" },
  check: { position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#22c55e", fontWeight: 700, fontSize: "16px" },
  err: { margin: "6px 0 0", fontSize: "12px", color: "#ef4444", fontWeight: 500 },
  ok: { margin: "6px 0 0", fontSize: "12px", color: "#16a34a", fontWeight: 500 },
  strengthRow: { display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" },
  bars: { display: "flex", gap: "4px", flex: 1 },
  bar: { flex: 1, height: "4px", borderRadius: "2px", transition: "background 0.3s" },
  btn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #f41b1b, #090df5)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700, letterSpacing: "1px", cursor: "pointer", boxShadow: "0 8px 20px rgba(102,126,234,0.35)", marginBottom: "20px", marginTop: "8px" },
  switch: { textAlign: "center", fontSize: "14px", color: "#718096", margin: 0 },
  link: { background: "none", border: "none", color: "#667eea", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: "14px", textDecoration: "underline" },
  otpRow: { display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px" },
  otpBox: { width: "48px", height: "56px", textAlign: "center", fontSize: "22px", fontWeight: 700, border: "2px solid #e2e8f0", borderRadius: "12px", outline: "none", color: "#1a202c", caretColor: "transparent", transition: "border-color 0.2s" },
};
