import { useState } from "react";
import Login from "./Login";
import Register from "./Register";
import Welcome from "./Welcome";
import ChatApp from "./ChatApp";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import { socket } from "./socket"; // ← shared socket instance

export const appDB = {
  users: [],
  messages: {},
};

const getSavedUser = () => {
  try {
    const saved = localStorage.getItem("fn_current_user");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

const saveUser = (user) => {
  try { localStorage.setItem("fn_current_user", JSON.stringify(user)); } catch {}
};

const clearUser = () => {
  try { localStorage.removeItem("fn_current_user"); } catch {}
};

export default function App() {
  const savedUser = getSavedUser();
  const [page, setPage] = useState(savedUser ? "chat" : "login");
  const [currentUser, setCurrentUser] = useState(savedUser);

  const handleLoginSuccess = (user) => {
    saveUser(user);
    setCurrentUser(user);
    setPage("welcome");
  };

  const handleRegisterSuccess = (user) => {
    const fullUser = { ...user, avatar: user.username[0].toUpperCase() };
    saveUser(fullUser);
    setCurrentUser(fullUser);
    setPage("welcome");
  };

  const handleLogout = () => {
    // Tell server this user is offline BEFORE clearing
    if (currentUser) {
      socket.emit("logout", currentUser.username);
      socket.disconnect();
    }
    clearUser();
    setCurrentUser(null);
    setPage("login");
  };

  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get("token");
  if (resetToken) return <ResetPassword token={resetToken} onDone={() => { window.location.href = "/"; }} />;

  if (page === "login") return <Login onNavigateToRegister={() => setPage("register")} onLoginSuccess={handleLoginSuccess} onForgotPassword={() => setPage("forgot")} appDB={appDB} />;
  if (page === "register") return <Register onNavigateToLogin={() => setPage("login")} onRegisterSuccess={handleRegisterSuccess} appDB={appDB} />;
  if (page === "forgot") return <ForgotPassword onBack={() => setPage("login")} />;
  if (page === "welcome") return <Welcome user={currentUser} onDone={() => setPage("chat")} />;
  return <ChatApp currentUser={currentUser} appDB={appDB} onLogout={handleLogout} />;
}
