import { useState, useEffect, useRef } from "react";
import { socket } from "./socket"; // shared instance

if (!document.getElementById("chatapp-styles")) {
  const style = document.createElement("style");
  style.id = "chatapp-styles";
  style.innerHTML = `
    .chat-layout { display: flex; height: 100vh; }
    .chat-sidebar {
      width: 300px; min-width: 300px; display: flex;
      flex-direction: column; background: #13132a;
      border-right: 1px solid rgba(255,255,255,0.07);
      transition: transform 0.3s ease;
    }
    .chat-window { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    @media (max-width: 768px) {
      .chat-sidebar {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 10; transform: translateX(0);
      }
      .chat-sidebar.hidden { transform: translateX(-100%); pointer-events: none; }
      .chat-window {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 10; transform: translateX(100%); transition: transform 0.3s ease;
      }
      .chat-window.visible { transform: translateX(0); }
    }
    input::placeholder { color: rgba(255,255,255,0.3); }
    .user-item:hover { background: rgba(255,255,255,0.04) !important; }
  `;
  document.head.appendChild(style);
}

export default function ChatApp({ currentUser, onLogout }) {
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [msgOffset, setMsgOffset] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [allUsers, setAllUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [lastMessages, setLastMessages] = useState({});
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeout = useRef(null);
  const activeChatUserRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    activeChatUserRef.current = activeChatUser;
  }, [activeChatUser]);

  useEffect(() => {
    // Reconnect if socket was disconnected (e.g. after logout)
    if (!socket.connected) socket.connect();

    // Register with server
    socket.emit("join", currentUser.username);

    // Re-register after reconnect (tab sleep, network blip)
    socket.on("connect", () => {
      socket.emit("join", currentUser.username);
    });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      socket.emit("heartbeat");
    }, 5000);

    // ── RECEIVE MESSAGE (with ACK) ──
    socket.on("receive_message", (msg, ack) => {
      // Send ACK back to server immediately
      if (typeof ack === "function") ack(true);

      const isFromMe = (msg.from_user || msg.from) === currentUser.username;
      const otherUser = isFromMe
        ? (msg.to_user || msg.to)
        : (msg.from_user || msg.from);
      const chatKey = [currentUser.username, otherUser].sort().join("_");

      const activeChatKey = activeChatUserRef.current
        ? [currentUser.username, activeChatUserRef.current.username].sort().join("_")
        : null;

      if (chatKey === activeChatKey) {
        setMessages((prev) => {
          // Replace optimistic message if it matches, or add if new
          const optimisticIdx = prev.findIndex(
            (m) => m.optimistic && m.text === msg.text && (m.from_user || m.from) === (msg.from_user || msg.from)
          );
          if (optimisticIdx !== -1) {
            const updated = [...prev];
            updated[optimisticIdx] = msg;
            return updated;
          }
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        if (!isFromMe) {
          socket.emit("mark_read", {
            from: msg.from_user || msg.from,
            to: currentUser.username,
          });
        }
      }

      setLastMessages((prev) => ({ ...prev, [chatKey]: msg }));
      setAllUsers((prev) => {
        const otherUsername = isFromMe ? (msg.to_user || msg.to) : (msg.from_user || msg.from);
        const exists = prev.find((u) => u.username === otherUsername);
        if (exists) {
          return [exists, ...prev.filter((u) => u.username !== otherUsername)];
        }
        return [{ username: otherUsername, avatar: otherUsername[0].toUpperCase() }, ...prev];
      });
    });

    // ── MESSAGE DELIVERED (update tick) ──
    socket.on("message_delivered", ({ id }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "delivered" } : m))
      );
    });

    // ── MESSAGES READ ──
    socket.on("messages_read", ({ by }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          (msg.from_user || msg.from) === currentUser.username &&
          (msg.to_user || msg.to) === by
            ? { ...msg, status: "read" }
            : msg
        )
      );
    });

    socket.on("online_list", (list) => {
      const map = {};
      list.forEach((u) => { map[u] = true; });
      setOnlineUsers(map);
    });

    socket.on("user_online", (username) => {
      setOnlineUsers((prev) => ({ ...prev, [username]: true }));
    });

    socket.on("user_offline", (username) => {
      setOnlineUsers((prev) => ({ ...prev, [username]: false }));
    });

    socket.on("typing", ({ from }) => {
      setTypingUsers((prev) => ({ ...prev, [from]: true }));
    });

    socket.on("stop_typing", ({ from }) => {
      setTypingUsers((prev) => ({ ...prev, [from]: false }));
    });

    return () => {
      clearInterval(heartbeat);
      socket.off("connect");
      socket.off("receive_message");
      socket.off("message_delivered");
      socket.off("messages_read");
      socket.off("online_list");
      socket.off("user_online");
      socket.off("user_offline");
      socket.off("typing");
      socket.off("stop_typing");
    };
  }, []);

  useEffect(() => {
    // Load ALL users for search
    fetch(`${import.meta.env.VITE_API_URL}/api/users`)
      .then((r) => r.json())
      .then((data) => {
        const others = data.users.filter((u) => u.username !== currentUser.username);
        // Load recent chats to sort sidebar
        fetch(`${import.meta.env.VITE_API_URL}/api/recent-chats/${currentUser.username}`)
          .then((r) => r.json())
          .then((rc) => {
            const recentUsernames = (rc.chats || [])
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((c) => c.other_user);
            // Sort: recent chats first, then rest
            const sorted = [
              ...recentUsernames.map((u) => others.find((x) => x.username === u)).filter(Boolean),
              ...others.filter((u) => !recentUsernames.includes(u.username)),
            ];
            setAllUsers(sorted);
            // Populate lastMessages
            const lm = {};
            (rc.chats || []).forEach((c) => {
              const key = [currentUser.username, c.other_user].sort().join("_");
              lm[key] = { from_user: c.from_user, text: c.text, time: c.time };
            });
            setLastMessages(lm);
          });
      });
  }, []);

  const filteredUsers = allUsers.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const getChatKey = (a, b) => [a, b].sort().join("_");

  const openChat = async (user) => {
    setActiveChatUser(user);
    setInput("");
    setMsgOffset(0);
    setHasMore(false);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${currentUser.username}/${user.username}?offset=0`);
      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(data.hasMore || false);
    } catch {
      setMessages([]);
    }

    socket.emit("mark_read", { from: user.username, to: currentUser.username });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const loadMore = async () => {
    const newOffset = msgOffset + 50;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${currentUser.username}/${activeChatUser.username}?offset=${newOffset}`);
      const data = await res.json();
      const older = data.messages || [];
      setMessages((prev) => [...older, ...prev]); // prepend older messages
      setHasMore(data.hasMore || false);
      setMsgOffset(newOffset);
    } catch {}
  };

  const closeChat = () => {
    setActiveChatUser(null);
    setMessages([]);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest(".user-menu-wrap")) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !activeChatUser) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // ── OPTIMISTIC UI — show message instantly ──
    const optimisticMsg = {
      optimistic: true,
      from_user: currentUser.username,
      to_user: activeChatUser.username,
      text,
      time,
      status: "sent",
      id: `temp_${Date.now()}`,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");

    // ── SEND WITH ACK ──
    socket.emit(
      "send_message",
      { from: currentUser.username, to: activeChatUser.username, text, time },
      (response) => {
        if (response?.status === "saved" && response.msg) {
          // Replace optimistic message with real saved message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticMsg.id ? response.msg : m
            )
          );
          const chatKey = getChatKey(currentUser.username, activeChatUser.username);
          setLastMessages((prev) => ({ ...prev, [chatKey]: response.msg }));
        } else if (response?.status === "error") {
          // Mark as failed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticMsg.id ? { ...m, status: "failed" } : m
            )
          );
        }
      }
    );

    socket.emit("stop_typing", { from: currentUser.username, to: activeChatUser.username });
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!activeChatUser) return;
    socket.emit("typing", { from: currentUser.username, to: activeChatUser.username });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("stop_typing", { from: currentUser.username, to: activeChatUser.username });
    }, 1500);
  };

  const avatarColor = (name) => {
    const colors = ["#667eea", "#f5576c", "#f093fb", "#4facfe", "#43e97b", "#fa709a", "#f6d365"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const lastMsg = (user) => {
    const key = getChatKey(currentUser.username, user.username);
    const msg = lastMessages[key];
    if (!msg) return "Click to start chatting";
    return ((msg.from_user || msg.from) === currentUser.username ? "You: " : "") + msg.text;
  };

  const formatTime = (msg) => {
    if (!msg.created_at) return msg.time;
  
    const date = new Date(msg.created_at);
    if (isNaN(date)) return msg.time;

    const now = new Date();
    const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const msgDay = toDay(date);
    const todayDay = toDay(now);
    const diffDays = Math.round((todayDay - msgDay) / 86400000);

    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (diffDays === 0) return timeStr;
    if (diffDays === 1) return `Yesterday ${timeStr}`;
    if (diffDays <= 6) return `${date.toLocaleDateString([], { weekday: "long" })} ${timeStr}`;
   return `${date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })} ${timeStr}`;
  };

  const statusTick = (status) => {
    if (status === "failed") return <span style={{ color: "#f5576c", fontSize: "11px" }}>✕</span>;
    if (status === "read") return <span style={{ color: "#43e97b", fontSize: "11px", fontWeight: 700 }}>✓✓</span>;
    if (status === "delivered") return <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: 700 }}>✓✓</span>;
    return <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", fontWeight: 700 }}>✓</span>;
  };

  const sidebarClass = `chat-sidebar${isMobile && activeChatUser ? " hidden" : ""}`;
  const windowClass = `chat-window${!isMobile || activeChatUser ? " visible" : ""}`;

  return (
    <div className="chat-layout" style={{ background: "#0f0f1e", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff", overflow: "hidden" }}>
      {/* ── SIDEBAR ── */}
      <div className={sidebarClass}>
        <div style={c.sideHeader}>
          <div style={c.sideTitle}>
            <span style={c.sideLogo}>💬</span>
            <span style={c.sideName}>ForeseesNetwork</span>
          </div>
          <div className="user-menu-wrap" style={{ position: "relative" }}>
            <button
              style={{ ...c.myAvatar, background: avatarColor(currentUser.username) }}
              onClick={() => setShowUserMenu((v) => !v)}
              type="button"
            >
              {currentUser.username[0].toUpperCase()}
            </button>
            {showUserMenu && (
              <div style={c.userMenu}>
                <div style={c.menuUsername}>@{currentUser.username}</div>
                <div style={c.menuEmail}>{currentUser.email}</div>
                <hr style={c.menuDivider} />
                <button style={c.menuLogout} onClick={onLogout} type="button">🚪 Logout</button>
              </div>
            )}
          </div>
        </div>

        <div style={c.searchWrap}>
          <span style={c.searchIcon}>🔍</span>
          <input
            style={c.searchInput}
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button style={c.clearSearch} onClick={() => setSearch("")} type="button">✕</button>}
        </div>

        <div style={c.userList}>
          {filteredUsers.length === 0 && <div style={c.noUsers}>No users found</div>}
          {filteredUsers.map((u) => (
            <div
              key={u.username}
              className="user-item"
              style={{
                ...c.userItem,
                background: activeChatUser?.username === u.username ? "rgba(102,126,234,0.15)" : "transparent",
                borderLeft: activeChatUser?.username === u.username ? "3px solid #667eea" : "3px solid transparent",
              }}
              onClick={() => openChat(u)}
            >
              <div style={{ position: "relative" }}>
                <div style={{ ...c.itemAvatar, background: avatarColor(u.username) }}>
                  {u.username[0].toUpperCase()}
                </div>
                {onlineUsers[u.username] && <div style={c.onlineDot} />}
              </div>
              <div style={c.itemInfo}>
                <div style={c.itemName}>@{u.username}</div>
                <div style={c.itemPreview}>
                  {typingUsers[u.username]
                    ? <span style={{ color: "#43e97b", fontStyle: "italic" }}>typing...</span>
                    : lastMsg(u)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CHAT WINDOW ── */}
      <div className={windowClass}>
        {!activeChatUser ? (
          <div style={c.emptyState}>
            <div style={c.emptyIcon}>💬</div>
            <h2 style={c.emptyTitle}>Select a conversation</h2>
            <p style={c.emptySubtitle}>Choose a user from the left to start chatting</p>
          </div>
        ) : (
          <>
            <div style={c.chatHeader}>
              <button style={c.backBtn} onClick={closeChat} type="button">←</button>
              <div style={{ position: "relative" }}>
                <div style={{ ...c.chatHeaderAvatar, background: avatarColor(activeChatUser.username) }}>
                  {activeChatUser.username[0].toUpperCase()}
                </div>
                {onlineUsers[activeChatUser.username] && <div style={c.onlineDotHeader} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={c.chatHeaderName}>@{activeChatUser.username}</div>
                <div style={c.chatHeaderStatus}>
                  {typingUsers[activeChatUser.username] ? (
                    <span style={{ color: "#43e97b" }}>typing...</span>
                  ) : onlineUsers[activeChatUser.username] ? (
                    <span style={{ color: "#43e97b" }}>● Online</span>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>● Offline</span>
                  )}
                </div>
              </div>
              {!isMobile && (
                <button style={c.closeBtn} onClick={closeChat} type="button">✕</button>
              )}
            </div>

            <div style={c.messages}>
              {hasMore && (
                <div style={{ textAlign: "center", padding: "10px" }}>
                  <button
                    onClick={loadMore}
                    type="button"
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "20px",
                      color: "rgba(255,255,255,0.5)",
                      padding: "6px 18px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Load older messages
                  </button>
                </div>
              )}
              {messages.length === 0 && (
                <div style={c.msgEmpty}>
                  <div style={{ ...c.msgEmptyAvatar, background: avatarColor(activeChatUser.username) }}>
                    {activeChatUser.username[0].toUpperCase()}
                  </div>
                  <p style={c.msgEmptyText}>
                    Say hello to <strong style={{ color: "#fff" }}>@{activeChatUser.username}</strong>
                  </p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = (msg.from_user || msg.from) === currentUser.username;
                return (
                  <div key={msg.id || i} style={{ ...c.msgRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    {!isMe && (
                      <div style={{ ...c.msgAvatar, background: avatarColor(msg.from_user || msg.from) }}>
                        {(msg.from_user || msg.from)[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{
                        ...c.bubble,
                        background: isMe
                          ? msg.status === "failed"
                            ? "rgba(245,87,108,0.3)"
                            : "linear-gradient(135deg, #667eea, #764ba2)"
                          : "rgba(255,255,255,0.08)",
                        borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        opacity: msg.optimistic ? 0.7 : 1,
                      }}>
                        {msg.text}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: "3px", paddingLeft: "4px", paddingRight: "4px" }}>
                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{formatTime(msg)}</span>
                        {isMe && statusTick(msg.status)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div style={c.inputBar}>
              <input
                ref={inputRef}
                style={c.input}
                placeholder={`Message @${activeChatUser.username}…`}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
              />
              <button
                style={{ ...c.sendBtn, opacity: input.trim() ? 1 : 0.4 }}
                onClick={sendMessage}
                disabled={!input.trim()}
                type="button"
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const c = {
  sideHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  sideTitle: { display: "flex", alignItems: "center", gap: "8px" },
  sideLogo: { fontSize: "20px" },
  sideName: { fontSize: "15px", fontWeight: 800, background: "linear-gradient(135deg, #667eea, #f5576c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  myAvatar: { width: "34px", height: "34px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  userMenu: { position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#1e1e3a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "14px", minWidth: "190px", zIndex: 100, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" },
  menuUsername: { fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "2px" },
  menuEmail: { fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "10px" },
  menuDivider: { border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0 0 10px" },
  menuLogout: { width: "100%", background: "rgba(245,87,108,0.12)", border: "1px solid rgba(245,87,108,0.25)", borderRadius: "8px", color: "#f5576c", padding: "8px 10px", cursor: "pointer", fontSize: "13px", fontWeight: 600, textAlign: "left" },
  searchWrap: { display: "flex", alignItems: "center", gap: "6px", margin: "12px", background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "0 10px", border: "1px solid rgba(255,255,255,0.08)" },
  searchIcon: { fontSize: "13px", opacity: 0.4, flexShrink: 0 },
  searchInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: "13px", padding: "10px 0" },
  clearSearch: { background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "11px", padding: "2px" },
  userList: { flex: 1, overflowY: "auto" },
  noUsers: { padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: "13px" },
  userItem: { display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", cursor: "pointer", transition: "background 0.15s", borderLeft: "3px solid transparent" },
  itemAvatar: { width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "16px", color: "#fff", flexShrink: 0 },
  onlineDot: { position: "absolute", bottom: "2px", right: "2px", width: "10px", height: "10px", borderRadius: "50%", background: "#43e97b", border: "2px solid #13132a" },
  onlineDotHeader: { position: "absolute", bottom: "2px", right: "2px", width: "10px", height: "10px", borderRadius: "50%", background: "#43e97b", border: "2px solid #13132a" },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "3px" },
  itemPreview: { fontSize: "12px", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  emptyState: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "24px" },
  emptyIcon: { fontSize: "52px", opacity: 0.3 },
  emptyTitle: { fontSize: "20px", fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: 0 },
  emptySubtitle: { fontSize: "14px", color: "rgba(255,255,255,0.25)", margin: 0, textAlign: "center" },
  chatHeader: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "rgba(19,19,42,0.98)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  backBtn: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", width: "36px", height: "36px", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chatHeaderAvatar: { width: "38px", height: "38px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "15px", color: "#fff", flexShrink: 0 },
  chatHeaderName: { fontSize: "15px", fontWeight: 700, color: "#fff" },
  chatHeaderStatus: { fontSize: "11px" },
  closeBtn: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.5)", width: "32px", height: "32px", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  messages: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  msgEmpty: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" },
  msgEmptyAvatar: { width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 700, color: "#fff" },
  msgEmptyText: { color: "rgba(255,255,255,0.35)", fontSize: "15px" },
  msgRow: { display: "flex", alignItems: "flex-end", gap: "8px" },
  msgAvatar: { width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#fff", flexShrink: 0 },
  bubble: { padding: "10px 16px", fontSize: "14px", lineHeight: 1.5, color: "#fff", wordBreak: "break-word" },
  inputBar: { display: "flex", gap: "10px", padding: "12px 16px", background: "rgba(19,19,42,0.98)", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  input: { flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "14px", padding: "12px 16px", outline: "none" },
  sendBtn: { width: "46px", height: "46px", borderRadius: "12px", background: "linear-gradient(135deg, #667eea, #764ba2)", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer", flexShrink: 0, transition: "opacity 0.2s" },
};
