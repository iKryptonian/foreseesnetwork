import { useEffect, useState } from "react";

export default function Welcome({ user, onDone }) {
  const [progress, setProgress] = useState(0);

  const name = user?.username || "there";

  useEffect(() => {
    // Animate progress bar from 0 to 100 over 2.5s using intervals
    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => onDone(), 300);
      }
    }, 100); // 50ms * 50 steps = 2500ms

    return () => clearInterval(interval);
  }, []);

  const avatarLetter = name[0].toUpperCase();

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "#0f0f1e",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* Glow blobs */}
      <div style={{ position: "absolute", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(102,126,234,0.3) 0%, transparent 70%)", top: "-150px", left: "-150px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(245,87,108,0.2) 0%, transparent 70%)", bottom: "-100px", right: "-100px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: "350px", height: "350px", borderRadius: "50%", background: "radial-gradient(circle, rgba(240,147,251,0.15) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />

      {/* Main content */}
      <div style={{
        position: "relative",
        zIndex: 2,
        textAlign: "center",
        padding: "0 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0px",
      }}>

        {/* Icon */}
        <div style={{
          fontSize: "64px",
          marginBottom: "20px",
          filter: "drop-shadow(0 0 30px rgba(102,126,234,0.9))",
          lineHeight: 1,
        }}>
          💬
        </div>

        {/* WELCOME TO label */}
        <p style={{
          fontSize: "11px",
          letterSpacing: "6px",
          color: "rgba(255,255,255,0.35)",
          margin: "0 0 10px",
          textTransform: "uppercase",
          fontWeight: 600,
        }}>
          WELCOME TO
        </p>

        {/* Site name */}
        <h1 style={{
          fontSize: "clamp(30px, 6vw, 54px)",
          fontWeight: 900,
          margin: "0 0 32px",
          background: "linear-gradient(135deg, #667eea 0%, #f5576c 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1.1,
        }}>
          ForeseesNetwork
        </h1>

        {/* User badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "50px",
          padding: "12px 24px",
          marginBottom: "36px",
        }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #667eea, #f5576c)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: "16px",
            flexShrink: 0,
          }}>
            {avatarLetter}
          </div>
          <span style={{ fontSize: "17px", color: "#ffffff", fontWeight: 500 }}>
            Hello, <strong style={{ color: "#fff", fontWeight: 800 }}>{name}</strong> 👋
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: "280px",
          height: "4px",
          background: "rgba(255,255,255,0.08)",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "16px",
        }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #667eea, #f5576c)",
            borderRadius: "4px",
            transition: "width 0.05s linear",
          }} />
        </div>

        {/* Loading text */}
        <p style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.3)",
          margin: 0,
          letterSpacing: "1px",
        }}>
          Loading your chats…
        </p>

      </div>
    </div>
  );
}
