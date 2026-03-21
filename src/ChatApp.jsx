import { useState, useEffect, useRef } from "react";
import { socket } from "./socket";

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
    .msg-bubble { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
    .msg-bubble:active { opacity: 0.85; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    * { -webkit-user-select: none; user-select: none; }
    input, textarea { -webkit-user-select: text !important; user-select: text !important; }
    * { -webkit-user-select: none; user-select: none; }
    input, textarea { -webkit-user-select: text !important; user-select: text !important; }
    .user-item:hover { background: rgba(255,255,255,0.04) !important; }
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 16px;
    }
    .modal-box {
      background: #1a1a35; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 24px; width: 100%; max-width: 420px;
      max-height: 80vh; overflow-y: auto;
    }
    .member-pick:hover { background: rgba(255,255,255,0.08) !important; }
    .tab-btn { transition: all 0.2s; }
    .tab-btn:hover { opacity: 0.8; }
  `;
  document.head.appendChild(style);
}

export default function ChatApp({ currentUser, onLogout }) {
  // ── 1-on-1 chat state ──
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [msgOffset, setMsgOffset] = useState(0);

  // ── Group chat state ──
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupHasMore, setGroupHasMore] = useState(false);
  const [groupMsgOffset, setGroupMsgOffset] = useState(0);
  const [myGroups, setMyGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [groupTypingUsers, setGroupTypingUsers] = useState({});
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [membersToAdd, setMembersToAdd] = useState([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const reactionHoverTimeout = useRef(null);
  const longPressTimeout = useRef(null);
  const tapTimeout = useRef(null);
  const [reactionPickerPos, setReactionPickerPos] = useState({ x: 0, y: 0 });
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null); // { id, text, isGroup, isMe }
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState("");

  // ── Create group modal ──
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── Sidebar tab: "chats" | "groups" ──
  const [sidebarTab, setSidebarTab] = useState("chats");

  // ── Common state ──
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
  const activeGroupRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);

    // Block copy
    const blockCopy = (e) => e.preventDefault();
    document.addEventListener("copy", blockCopy);
    document.addEventListener("cut", blockCopy);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("cut", blockCopy);
    };
  }, []);

  useEffect(() => { activeChatUserRef.current = activeChatUser; }, [activeChatUser]);
  useEffect(() => { activeGroupRef.current = activeGroup; }, [activeGroup]);

  // ── SOCKET SETUP ──
  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.emit("join", currentUser.username);

    socket.on("connect", () => {
      socket.emit("join", currentUser.username);
    });

    const heartbeat = setInterval(() => {
      socket.emit("heartbeat");
    }, 5000);

    // ── 1-on-1 message received ──
    socket.on("receive_message", (msg, ack) => {
      if (typeof ack === "function") ack(true);

      const isFromMe = (msg.from_user || msg.from) === currentUser.username;
      const otherUser = isFromMe ? (msg.to_user || msg.to) : (msg.from_user || msg.from);
      const chatKey = [currentUser.username, otherUser].sort().join("_");
      const activeChatKey = activeChatUserRef.current
        ? [currentUser.username, activeChatUserRef.current.username].sort().join("_")
        : null;

      if (chatKey === activeChatKey) {
        setMessages((prev) => {
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
          socket.emit("mark_read", { from: msg.from_user || msg.from, to: currentUser.username });
        }
      }

      setLastMessages((prev) => ({ ...prev, [chatKey]: msg }));
      setAllUsers((prev) => {
        const exists = prev.find((u) => u.username === otherUser);
        if (exists) return [exists, ...prev.filter((u) => u.username !== otherUser)];
        return [{ username: otherUser, avatar: otherUser[0].toUpperCase() }, ...prev];
      });
    });

    socket.on("message_delivered", ({ id }) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "delivered" } : m)));
    });

    socket.on("messages_read", ({ by }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          (msg.from_user || msg.from) === currentUser.username && (msg.to_user || msg.to) === by
            ? { ...msg, status: "read" } : msg
        )
      );
    });

    socket.on("online_list", (list) => {
      const map = {};
      list.forEach((u) => { map[u] = true; });
      setOnlineUsers(map);
    });
    socket.on("user_online", (username) => setOnlineUsers((p) => ({ ...p, [username]: true })));
    socket.on("user_offline", (username) => setOnlineUsers((p) => ({ ...p, [username]: false })));
    socket.on("typing", ({ from }) => setTypingUsers((p) => ({ ...p, [from]: true })));
    socket.on("stop_typing", ({ from }) => setTypingUsers((p) => ({ ...p, [from]: false })));

    // ── GROUP EVENTS ──
    socket.on("group_created", (group) => {
      setMyGroups((prev) => {
        if (prev.find((g) => g.id === group.id)) return prev;
        return [group, ...prev];
      });
    });

    socket.on("receive_group_message", (msg) => {
      // Update last message preview in sidebar
      setMyGroups((prev) =>
        prev.map((g) =>
          g.id === msg.group_id
            ? { ...g, last_message: msg.text, last_message_from: msg.from_user, last_message_at: msg.created_at }
            : g
        )
      );

      if (activeGroupRef.current?.id === msg.group_id) {
        setGroupMessages((prev) => {
          const optimisticIdx = prev.findIndex(
            (m) => m.optimistic && m.text === msg.text && m.from_user === msg.from_user
          );
          if (optimisticIdx !== -1) {
            const updated = [...prev];
            updated[optimisticIdx] = msg;
            return updated;
          }
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    socket.on("group_role_updated", ({ groupId, username, role, promotedBy }) => {
      setGroupMembers((prev) =>
        prev.map((m) => m.username === username ? { ...m, role } : m)
      );
    });

    socket.on("member_removed", ({ groupId, username }) => {
      setGroupMembers((prev) => prev.filter((m) => m.username !== username));
      setMyGroups((prev) =>
        prev.map((g) => g.id === groupId ? { ...g, member_count: Math.max(0, (g.member_count || 1) - 1) } : g)
      );
    });

    socket.on("removed_from_group", ({ groupId }) => {
      setMyGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (activeGroupRef.current?.id === groupId) {
        setActiveGroup(null);
        setGroupMessages([]);
        setShowMembersPanel(false);
      }
    });

    socket.on("left_group", ({ groupId }) => {
      setMyGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (activeGroupRef.current?.id === groupId) {
        setActiveGroup(null);
        setGroupMessages([]);
        setShowMembersPanel(false);
      }
    });

    socket.on("member_left", ({ groupId, username }) => {
      setGroupMembers((prev) => prev.filter((m) => m.username !== username));
    });

    socket.on("members_added", ({ groupId, allMembers }) => {
      if (activeGroupRef.current?.id === groupId) {
        setGroupMembers(allMembers);
      }
      setMyGroups((prev) =>
        prev.map((g) => g.id === groupId ? { ...g, member_count: allMembers.length } : g)
      );
    });

    socket.on("message_edited", ({ messageId, newText, isGroup }) => {
      if (isGroup) {
        setGroupMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, text: newText, edited: true } : m));
      } else {
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, text: newText, edited: true } : m));
      }
    });

    socket.on("message_deleted", ({ messageId, isGroup }) => {
      if (isGroup) {
        setGroupMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, text: "This message was deleted", deleted: true, reactions: {} } : m));
      } else {
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, text: "This message was deleted", deleted: true, reactions: {} } : m));
      }
    });

    socket.on("reaction_updated", ({ messageId, reactions, isGroup }) => {
      if (isGroup) {
        setGroupMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, reactions } : m)
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, reactions } : m)
        );
      }
    });

    socket.on("group_typing", ({ from, groupId }) => {
      if (activeGroupRef.current?.id === groupId) {
        setGroupTypingUsers((p) => ({ ...p, [from]: true }));
      }
    });
    socket.on("group_stop_typing", ({ from, groupId }) => {
      setGroupTypingUsers((p) => ({ ...p, [from]: false }));
    });

    socket.on("group_error", ({ message }) => {
      alert(message);
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
      socket.off("group_created");
      socket.off("receive_group_message");
      socket.off("group_role_updated");
      socket.off("member_removed");
      socket.off("removed_from_group");
      socket.off("left_group");
      socket.off("member_left");
      socket.off("members_added");
      socket.off("reaction_updated");
      socket.off("message_edited");
      socket.off("message_deleted");

      socket.off("group_typing");
      socket.off("group_stop_typing");
      socket.off("group_error");
    };
  }, []);

  // ── LOAD USERS + RECENT CHATS ──
  useEffect(() => {
    fetch(`/api/users`)
      .then((r) => r.json())
      .then((data) => {
        const others = data.users.filter((u) => u.username !== currentUser.username);
        fetch(`/api/recent-chats/${currentUser.username}`)
          .then((r) => r.json())
          .then((rc) => {
            const recentUsernames = (rc.chats || [])
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((c) => c.other_user);
            const sorted = [
              ...recentUsernames.map((u) => others.find((x) => x.username === u)).filter(Boolean),
              ...others.filter((u) => !recentUsernames.includes(u.username)),
            ];
            setAllUsers(sorted);
            const lm = {};
            (rc.chats || []).forEach((c) => {
              const key = [currentUser.username, c.other_user].sort().join("_");
              lm[key] = { from_user: c.from_user, text: c.text, time: c.time };
            });
            setLastMessages(lm);
          });
      });

    // Load my groups
    fetch(`/api/groups/user/${currentUser.username}`)
      .then((r) => r.json())
      .then((data) => setMyGroups(data.groups || []));
  }, []);

  // ── HELPERS ──
  const filteredUsers = allUsers.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = myGroups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const getChatKey = (a, b) => [a, b].sort().join("_");

  const avatarColor = (name) => {
    const colors = ["#667eea", "#f5576c", "#f093fb", "#4facfe", "#43e97b", "#fa709a", "#f6d365"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const formatTime = (msg) => {
    if (!msg.created_at) return msg.time;
    const date = new Date(msg.created_at);
    if (isNaN(date)) return msg.time;
    const now = new Date();
    const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((toDay(now) - toDay(date)) / 86400000);
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

  const lastMsg = (user) => {
    const key = getChatKey(currentUser.username, user.username);
    const msg = lastMessages[key];
    if (!msg) return "Click to start chatting";
    return ((msg.from_user || msg.from) === currentUser.username ? "You: " : "") + msg.text;
  };

  const groupLastMsg = (group) => {
    if (!group.last_message) return "No messages yet";
    const prefix = group.last_message_from === currentUser.username ? "You: " : `${group.last_message_from}: `;
    return prefix + group.last_message;
  };

  // ── OPEN 1-ON-1 CHAT ──
  const openChat = async (user) => {
    setActiveGroup(null);
    setGroupMessages([]);
    setShowMembersPanel(false);
    setActiveChatUser(user);
    setSidebarTab("chats");
    setInput("");
    setMsgOffset(0);
    setHasMore(false);

    try {
      const res = await fetch(`/api/messages/${currentUser.username}/${user.username}?offset=0`);
      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(data.hasMore || false);
    } catch { setMessages([]); }

    socket.emit("mark_read", { from: user.username, to: currentUser.username });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── OPEN GROUP CHAT ──
  const openGroup = async (group) => {
    setActiveChatUser(null);
    setMessages([]);
    setShowMembersPanel(false);
    setActiveGroup(group);
    setSidebarTab("groups");
    setInput("");
    setGroupMsgOffset(0);
    setGroupHasMore(false);

    try {
      const [msgRes, memRes] = await Promise.all([
        fetch(`/api/groups/${group.id}/messages?offset=0`),
        fetch(`/api/groups/${group.id}/members`),
      ]);
      const msgData = await msgRes.json();
      const memData = await memRes.json();
      setGroupMessages(msgData.messages || []);
      setGroupHasMore(msgData.hasMore || false);
      setGroupMembers(memData.members || []);
    } catch {
      setGroupMessages([]);
      setGroupMembers([]);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const loadMore = async () => {
    const newOffset = msgOffset + 50;
    try {
      const res = await fetch(`/api/messages/${currentUser.username}/${activeChatUser.username}?offset=${newOffset}`);
      const data = await res.json();
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMore(data.hasMore || false);
      setMsgOffset(newOffset);
    } catch {}
  };

  const loadMoreGroup = async () => {
    const newOffset = groupMsgOffset + 50;
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/messages?offset=${newOffset}`);
      const data = await res.json();
      setGroupMessages((prev) => [...(data.messages || []), ...prev]);
      setGroupHasMore(data.hasMore || false);
      setGroupMsgOffset(newOffset);
    } catch {}
  };

  const closeChat = () => {
    setActiveChatUser(null);
    setActiveGroup(null);
    setMessages([]);
    setGroupMessages([]);
    setShowMembersPanel(false);
  };

  const prevMsgCountRef = useRef(0);
  const prevGroupMsgCountRef = useRef(0);

  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = currentCount;
  }, [messages]);

  useEffect(() => {
    const currentCount = groupMessages.length;
    if (currentCount > prevGroupMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevGroupMsgCountRef.current = currentCount;
  }, [groupMessages]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest(".user-menu-wrap")) setShowUserMenu(false);
      if (!e.target.closest(".members-panel") && !e.target.closest(".members-btn")) {
        setShowMembersPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── SEND MESSAGE ──
  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (activeChatUser) {
      const optimisticMsg = {
        optimistic: true,
        from_user: currentUser.username,
        to_user: activeChatUser.username,
        text, time, status: "sent",
        id: `temp_${Date.now()}`,
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setInput("");

      socket.emit("send_message",
        { from: currentUser.username, to: activeChatUser.username, text, time, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, from_user: replyTo.from_user } : null },
        (response) => {
          if (response?.status === "saved" && response.msg) {
            setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? response.msg : m));
            const chatKey = getChatKey(currentUser.username, activeChatUser.username);
            setLastMessages((prev) => ({ ...prev, [chatKey]: response.msg }));
            setReplyTo(null);
          } else if (response?.status === "error") {
            setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? { ...m, status: "failed" } : m));
          }
        }
      );

      socket.emit("stop_typing", { from: currentUser.username, to: activeChatUser.username });
    } else if (activeGroup) {
      const optimisticMsg = {
        optimistic: true,
        group_id: activeGroup.id,
        from_user: currentUser.username,
        text, time, status: "sent",
        id: `temp_${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      setGroupMessages((prev) => [...prev, optimisticMsg]);
      setInput("");

      socket.emit("send_group_message",
        { groupId: activeGroup.id, from: currentUser.username, text, time, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, from_user: replyTo.from_user } : null },
        (response) => {
          if (response?.status === "saved" && response.msg) {
            setGroupMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? response.msg : m));
            setReplyTo(null);
            setMyGroups((prev) =>
              prev.map((g) =>
                g.id === activeGroup.id
                  ? { ...g, last_message: text, last_message_from: currentUser.username }
                  : g
              )
            );
          } else if (response?.status === "error") {
            setGroupMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? { ...m, status: "failed" } : m));
          }
        }
      );

      socket.emit("group_stop_typing", { from: currentUser.username, groupId: activeGroup.id });
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (activeChatUser) {
      socket.emit("typing", { from: currentUser.username, to: activeChatUser.username });
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit("stop_typing", { from: currentUser.username, to: activeChatUser.username });
      }, 1500);
    } else if (activeGroup) {
      socket.emit("group_typing", { from: currentUser.username, groupId: activeGroup.id });
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit("group_stop_typing", { from: currentUser.username, groupId: activeGroup.id });
      }, 1500);
    }
  };

  // ── CREATE GROUP ──
  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await fetch(`/api/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          createdBy: currentUser.username,
          members: selectedMembers,
        }),
      });
      const data = await res.json();
      if (data.group) {
        setShowCreateGroup(false);
        setNewGroupName("");
        setSelectedMembers([]);
        setSidebarTab("groups");
        openGroup(data.group);
      }
    } catch (err) {
      console.error("Create group error:", err);
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleMember = (username) => {
    setSelectedMembers((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  };

  // ── PROMOTE TO ADMIN ──
  const promoteToAdmin = (targetUser) => {
    socket.emit("make_admin", {
      groupId: activeGroup.id,
      targetUser,
      requestedBy: currentUser.username,
    });
  };

  const demoteAdmin = (targetUser) => {
    socket.emit("demote_admin", {
      groupId: activeGroup.id,
      targetUser,
      requestedBy: currentUser.username,
    });
  };

  const removeMember = (targetUser) => {
    if (!window.confirm(`Remove @${targetUser} from the group?`)) return;
    socket.emit("remove_member", {
      groupId: activeGroup.id,
      targetUser,
      requestedBy: currentUser.username,
    });
  };

  const leaveGroup = () => {
    if (!window.confirm(`Leave ${activeGroup.name}?`)) return;
    socket.emit("leave_group", { groupId: activeGroup.id, username: currentUser.username });
  };

  const addMembers = () => {
    if (membersToAdd.length === 0) return;
    setAddingMembers(true);
    socket.emit("add_members", {
      groupId: activeGroup.id,
      newMembers: membersToAdd,
      requestedBy: currentUser.username,
    });
    setMembersToAdd([]);
    setShowAddMembers(false);
    setAddingMembers(false);
  };

  const toggleReaction = (messageId, emoji, isGroup) => {
    socket.emit("add_reaction", {
      messageId,
      groupId: activeGroup?.id,
      emoji,
      username: currentUser.username,
      isGroup: !!isGroup,
    });
    // Keep picker open so user can add multiple reactions
  };

  const editMessage = (msgId, currentText, isGroup) => {
    setEditingMsgId(msgId);
    setEditText(currentText);
    setMsgMenu(null);
  };

  const saveEdit = (msgId, isGroup) => {
    if (!editText.trim()) return;
    socket.emit("edit_message", {
      messageId: msgId,
      newText: editText.trim(),
      username: currentUser.username,
      isGroup: !!isGroup,
      groupId: activeGroup?.id,
    });
    setEditingMsgId(null);
    setEditText("");
  };

  const deleteMessage = (msgId, isGroup) => {
    socket.emit("delete_message", {
      messageId: msgId,
      username: currentUser.username,
      isGroup: !!isGroup,
      groupId: activeGroup?.id,
    });
    setMsgMenu(null);
  };

  const handleReply = (msg) => {
    setReplyTo({
      id: msg.id,
      text: msg.text,
      from_user: msg.from_user || msg.from,
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const messagesContainerRef = useRef(null);

  const scrollToMessage = (msgId) => {
    if (!msgId) return;
    const id = String(msgId);
    let el = document.getElementById(`msg-${id}`);
    if (!el) el = document.getElementById(`msg-${parseInt(id)}`);
    if (!el) return;
    const container = messagesContainerRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - containerRect.top - (containerRect.height / 2) + (elRect.height / 2);
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
    el.style.transition = "background 0.5s ease";
    el.style.background = "rgba(102,126,234,0.35)";
    setTimeout(() => { el.style.background = ""; }, 1800);
  };

  const myRoleInGroup = groupMembers.find((m) => m.username === currentUser.username)?.role;
  const isGroupAdmin = myRoleInGroup === "admin";
  const isGroupCreator = activeGroup?.created_by === currentUser.username;

  const sidebarClass = `chat-sidebar${isMobile && (activeChatUser || activeGroup) ? " hidden" : ""}`;
  const windowClass = `chat-window${!isMobile || activeChatUser || activeGroup ? " visible" : ""}`;
  const activeChat = activeChatUser || activeGroup;

  return (
    <div
      className="chat-layout"
      style={{ background: "#0f0f1e", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff", overflow: "hidden" }}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        // Allow context menu on inputs only
        if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
          e.preventDefault();
        }
      }}
    >

      {/* ── CREATE GROUP MODAL ── */}
      {reactionPickerMsgId && (
        <>
          {/* Backdrop */}
          <div
            onMouseDown={() => { setReactionPickerMsgId(null); setShowAllEmojis(false); }}
            onTouchStart={() => { setReactionPickerMsgId(null); setShowAllEmojis(false); setSelectedMsg(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 1999 }}
          />
          {/* Unified Picker */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: (() => {
                const pickerH = showAllEmojis ? 220 : 56;
                const headerH = 130;
                const bottomPad = 80;
                let top = reactionPickerPos.y - pickerH - 12;
                if (top < headerH) top = reactionPickerPos.y + 20;
                if (top + pickerH > window.innerHeight - bottomPad) top = window.innerHeight - bottomPad - pickerH;
                return Math.max(headerH, top);
              })(),
              left: (() => {
                const pickerW = showAllEmojis ? Math.min(320, window.innerWidth - 20) : 220;
                let left = reactionPickerPos.x - pickerW / 2;
                if (left < 10) left = 10;
                if (left + pickerW > window.innerWidth - 10) left = window.innerWidth - pickerW - 10;
                return left;
              })(),
              background: "#1a1a35",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "20px",
              padding: "10px 12px",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              zIndex: 2000,
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              width: showAllEmojis ? Math.min(320, window.innerWidth - 20) : "auto",
              maxHeight: showAllEmojis ? "min(220px, 45vh)" : "none",
              overflowY: showAllEmojis ? "auto" : "visible",
            }}
          >
            {(showAllEmojis
              ? [
                  // Smileys
                  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
                  "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥",
                  "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓",
                  "🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣",
                  "😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖",
                  // Gestures & People
                  "👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎",
                  "✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🫀","🫁","🦷","👀","👁",
                  // Hearts & Love
                  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️",
                  "❤️‍🔥","❤️‍🩹","💏","💑","👫","👬","👭","💋","💌","💍","💎",
                  // Activities & Objects
                  "🎉","🎊","🎈","🎁","🏆","🥇","🥈","🥉","🎖","🏅","🎗","🎀","🎪","🎭","🎨","🖼","🎬","🎤","🎧","🎵",
                  "🎶","🎸","🎹","🎺","🎻","🥁","🎮","🕹","🎲","🎯","🎳","🎰","🧩","🪀","🪁","🔮","🪄","🎠","🎡","🎢",
                  // Nature
                  "🌈","⭐","🌟","💫","✨","🌙","☀️","🌤","⛅","🌦","🌧","⛈","🌩","❄️","🌊","🌸","🌺","🌻","🌹","🌷",
                  "🍀","🌿","🍃","🌱","🌲","🌳","🌴","🌵","🎋","🎄","🌾","🍁","🍂","🍄","🐚","🌰","🦔","🐾",
                  // Animals
                  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
                  "🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🐢","🐍",
                  // Food
                  "🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍆","🌽","🌶","🥕","🧅","🧄","🥔",
                  "🍕","🍔","🍟","🌭","🌮","🌯","🥙","🧆","🥚","🍳","🥘","🍲","🍜","🍝","🍛","🍣","🍱","🍤","🍙","🍚",
                  "🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","☕","🍵","🧃","🥤","🧋","🍺",
                  // Travel & Places
                  "🚀","✈️","🚂","🚗","🚕","🚙","🏎","🚓","🚑","🚒","🚌","🚎","🏍","🚲","🛴","🛵","🚁","🛸","⛵","🚤",
                  "🗺","🏔","⛰","🌋","🗻","🏕","🏖","🏜","🏝","🏗","🏘","🏚","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨",
                  // Symbols
                  "🔥","💥","✨","⚡","🌀","🌈","🎆","🎇","✅","❌","❓","❗","💯","🔔","🔕","🚨","⚠️","🔱","♻️","🆘",
                  "💤","💢","💬","💭","🗯","💫","💦","💨","🕳","💣","💊","💉","🩸","🩹","🩺","🔑","🗝","🔒","🔓","🔨",
                ]
              : ["👍","❤️","😂","😮","😢"]
            ).map((emoji) => (
              <span
                key={emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  const isGroup = !!activeGroup;
                  toggleReaction(reactionPickerMsgId, emoji, isGroup);
                  setReactionPickerMsgId(null);
                  setShowAllEmojis(false);
                }}
                style={{ fontSize: "20px", cursor: "pointer", padding: "3px", borderRadius: "8px", transition: "transform 0.1s", display: "inline-block" }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.3)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              >{emoji}</span>
            ))}
            {!showAllEmojis && (
              <span
                onClick={(e) => { e.stopPropagation(); setShowAllEmojis(true); }}
                style={{ fontSize: "13px", cursor: "pointer", padding: "4px 10px", borderRadius: "12px", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", fontWeight: 600 }}
              >+</span>
            )}
          </div>
        </>
      )}



      {showAddMembers && activeGroup && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddMembers(false)}>
          <div className="modal-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Add Members to {activeGroup.name}</h3>
              <button onClick={() => setShowAddMembers(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
            <input
              style={{ ...c.input, width: "100%", boxSizing: "border-box", marginBottom: "12px" }}
              placeholder="Search users..."
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
            />
            <div style={{ maxHeight: "220px", overflowY: "auto", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "16px" }}>
              {allUsers
                .filter((u) => !groupMembers.find((m) => m.username === u.username))
                .filter((u) => u.username.toLowerCase().includes(addMemberSearch.toLowerCase()))
                .map((u) => {
                  const selected = membersToAdd.includes(u.username);
                  return (
                    <div
                      key={u.username}
                      className="member-pick"
                      onClick={() => setMembersToAdd((prev) =>
                        prev.includes(u.username) ? prev.filter((x) => x !== u.username) : [...prev, u.username]
                      )}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", cursor: "pointer", background: selected ? "rgba(102,126,234,0.15)" : "transparent" }}
                    >
                      <div style={{ ...c.itemAvatar, width: "34px", height: "34px", fontSize: "13px", background: avatarColor(u.username), flexShrink: 0 }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: "14px" }}>@{u.username}</span>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${selected ? "#667eea" : "rgba(255,255,255,0.2)"}`, background: selected ? "#667eea" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                        {selected && "✓"}
                      </div>
                    </div>
                  );
                })}
            </div>
            <button
              onClick={addMembers}
              disabled={membersToAdd.length === 0 || addingMembers}
              style={{
                width: "100%", padding: "12px",
                background: membersToAdd.length > 0 ? "linear-gradient(135deg, #667eea, #764ba2)" : "rgba(255,255,255,0.1)",
                border: "none", borderRadius: "10px", color: "#fff",
                fontSize: "14px", fontWeight: 700, cursor: membersToAdd.length > 0 ? "pointer" : "not-allowed",
              }}
            >
              {addingMembers ? "Adding..." : `Add ${membersToAdd.length > 0 ? membersToAdd.length + " member(s)" : "Members"}`}
            </button>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateGroup(false)}>
          <div className="modal-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Create New Group</h3>
              <button onClick={() => setShowCreateGroup(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "6px", display: "block" }}>GROUP NAME</label>
              <input
                style={{ ...c.input, width: "100%", boxSizing: "border-box" }}
                placeholder="e.g. Project Alpha, Dev Team..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "8px", display: "block" }}>
                ADD MEMBERS ({selectedMembers.length} selected)
              </label>
              <div style={{ maxHeight: "220px", overflowY: "auto", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
                {allUsers.map((u) => {
                  const selected = selectedMembers.includes(u.username);
                  return (
                    <div
                      key={u.username}
                      className="member-pick"
                      onClick={() => toggleMember(u.username)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "10px 14px", cursor: "pointer",
                        background: selected ? "rgba(102,126,234,0.15)" : "transparent",
                      }}
                    >
                      <div style={{ ...c.itemAvatar, width: "34px", height: "34px", fontSize: "13px", background: avatarColor(u.username), flexShrink: 0 }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: "14px" }}>@{u.username}</span>
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%",
                        border: `2px solid ${selected ? "#667eea" : "rgba(255,255,255,0.2)"}`,
                        background: selected ? "#667eea" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", flexShrink: 0,
                      }}>
                        {selected && "✓"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={createGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              style={{
                width: "100%", padding: "12px",
                background: newGroupName.trim() ? "linear-gradient(135deg, #667eea, #764ba2)" : "rgba(255,255,255,0.1)",
                border: "none", borderRadius: "10px", color: "#fff",
                fontSize: "14px", fontWeight: 700, cursor: newGroupName.trim() ? "pointer" : "not-allowed",
              }}
            >
              {creatingGroup ? "Creating..." : `Create Group${selectedMembers.length > 0 ? ` with ${selectedMembers.length + 1} members` : ""}`}
            </button>
          </div>
        </div>
      )}

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

        {/* ── TABS ── */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {["chats", "groups"].map((tab) => (
            <button
              key={tab}
              className="tab-btn"
              onClick={() => setSidebarTab(tab)}
              style={{
                flex: 1, padding: "10px", background: "none", border: "none",
                color: sidebarTab === tab ? "#667eea" : "rgba(255,255,255,0.35)",
                fontSize: "13px", fontWeight: 700, cursor: "pointer",
                borderBottom: sidebarTab === tab ? "2px solid #667eea" : "2px solid transparent",
                textTransform: "capitalize",
              }}
            >
              {tab === "groups" ? `👥 Groups (${myGroups.length})` : "💬 Chats"}
            </button>
          ))}
        </div>

        {/* ── SEARCH ── */}
        <div style={c.searchWrap}>
          <span style={c.searchIcon}>🔍</span>
          <input
            style={c.searchInput}
            placeholder={sidebarTab === "groups" ? "Search groups…" : "Search users…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button style={c.clearSearch} onClick={() => setSearch("")} type="button">✕</button>}
        </div>

        {/* ── CHATS TAB ── */}
        {sidebarTab === "chats" && (
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
        )}

        {/* ── GROUPS TAB ── */}
        {sidebarTab === "groups" && (
          <div style={{ ...c.userList, display: "flex", flexDirection: "column" }}>
            <button
              onClick={() => setShowCreateGroup(true)}
              style={{
                margin: "10px 12px 4px", padding: "10px",
                background: "linear-gradient(135deg, rgba(102,126,234,0.2), rgba(118,75,162,0.2))",
                border: "1px dashed rgba(102,126,234,0.4)",
                borderRadius: "10px", color: "#667eea",
                fontSize: "13px", fontWeight: 700, cursor: "pointer",
              }}
            >
              + New Group
            </button>

            {filteredGroups.length === 0 && (
              <div style={c.noUsers}>
                {myGroups.length === 0 ? "No groups yet. Create one!" : "No groups found"}
              </div>
            )}

            {filteredGroups.map((g) => (
              <div
                key={g.id}
                className="user-item"
                style={{
                  ...c.userItem,
                  background: activeGroup?.id === g.id ? "rgba(102,126,234,0.15)" : "transparent",
                  borderLeft: activeGroup?.id === g.id ? "3px solid #667eea" : "3px solid transparent",
                }}
                onClick={() => openGroup(g)}
              >
                <div style={{ ...c.itemAvatar, background: avatarColor(g.name), fontSize: "16px" }}>
                  {g.name[0].toUpperCase()}
                </div>
                <div style={c.itemInfo}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={c.itemName}>{g.name}</span>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>·{g.member_count} members</span>
                  </div>
                  <div style={c.itemPreview}>{groupLastMsg(g)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CHAT WINDOW ── */}
      <div className={windowClass} style={{ display: "flex" }}>
        {!activeChat ? (
          <div style={{ ...c.emptyState, flex: 1 }}>
            <div style={c.emptyIcon}>💬</div>
            <h2 style={c.emptyTitle}>Select a conversation</h2>
            <p style={c.emptySubtitle}>Choose a user or group from the left to start chatting</p>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* ── CHAT HEADER ── */}
            <div style={c.chatHeader}>
              <button style={c.backBtn} onClick={closeChat} type="button">←</button>

              {activeChatUser && (
                <>
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
                  {selectedMsg && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <button onClick={() => { handleReply({ id: selectedMsg.id, text: selectedMsg.text, from_user: selectedMsg.from_user }); setSelectedMsg(null); }}
                        title="Reply" style={c.headerActionBtn}>↩</button>
                      {selectedMsg.isMe && (
                        <button onClick={() => { editMessage(selectedMsg.id, selectedMsg.text, false); setSelectedMsg(null); }}
                          title="Edit" style={{ ...c.headerActionBtn, color: "#667eea" }}>✏️</button>
                      )}
                      {selectedMsg.isMe && (
                        <button onClick={() => { deleteMessage(selectedMsg.id, false); setSelectedMsg(null); }}
                          title="Delete" style={{ ...c.headerActionBtn, color: "#f5576c" }}>🗑️</button>
                      )}
                      <button onClick={() => setSelectedMsg(null)}
                        style={{ ...c.headerActionBtn, fontSize: "11px", opacity: 0.4 }}>✕</button>
                    </div>
                  )}
                </>
              )}

              {activeGroup && (
                <>
                  <div style={{ ...c.chatHeaderAvatar, background: avatarColor(activeGroup.name), fontSize: "16px" }}>
                    {activeGroup.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={c.chatHeaderName}>{activeGroup.name}</div>
                    <div style={c.chatHeaderStatus}>
                      {Object.keys(groupTypingUsers).filter((u) => groupTypingUsers[u]).length > 0 ? (
                        <span style={{ color: "#43e97b" }}>
                          {Object.keys(groupTypingUsers).filter((u) => groupTypingUsers[u]).join(", ")} typing...
                        </span>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>
                          {groupMembers.length} members · {isGroupAdmin ? "You are admin" : `You are ${myRoleInGroup}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedMsg && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <button onClick={() => { handleReply({ id: selectedMsg.id, text: selectedMsg.text, from_user: selectedMsg.from_user }); setSelectedMsg(null); }}
                        title="Reply" style={c.headerActionBtn}>↩</button>
                      {selectedMsg.isMe && (
                        <button onClick={() => { editMessage(selectedMsg.id, selectedMsg.text, true); setSelectedMsg(null); }}
                          title="Edit" style={{ ...c.headerActionBtn, color: "#667eea" }}>✏️</button>
                      )}
                      {selectedMsg.isMe && (
                        <button onClick={() => { deleteMessage(selectedMsg.id, true); setSelectedMsg(null); }}
                          title="Delete" style={{ ...c.headerActionBtn, color: "#f5576c" }}>🗑️</button>
                      )}
                      <button onClick={() => setSelectedMsg(null)}
                        style={{ ...c.headerActionBtn, fontSize: "11px", opacity: 0.4 }}>✕</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="members-btn"
                      onClick={() => setShowMembersPanel((v) => !v)}
                      style={{
                        background: showMembersPanel ? "rgba(102,126,234,0.2)" : "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                        color: "#fff", padding: "6px 12px", cursor: "pointer", fontSize: "12px",
                      }}
                    >👥 Members</button>
                    {!isGroupCreator && (
                      <button
                        onClick={leaveGroup}
                        style={{
                          background: "rgba(245,87,108,0.1)", border: "1px solid rgba(245,87,108,0.3)",
                          borderRadius: "8px", color: "#f5576c", padding: "6px 12px", cursor: "pointer", fontSize: "12px",
                        }}
                      >🚪 Leave</button>
                    )}
                  </div>
                </>
              )}

              {!isMobile && (
                <button style={c.closeBtn} onClick={closeChat} type="button">✕</button>
              )}
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* ── MESSAGES ── */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div ref={messagesContainerRef} style={c.messages}>
                  {/* 1-on-1 messages */}
                  {activeChatUser && (
                    <>
                      {hasMore && (
                        <div style={{ textAlign: "center", padding: "10px" }}>
                          <button onClick={loadMore} type="button" style={c.loadMoreBtn}>Load older messages</button>
                        </div>
                      )}
                      {messages.length === 0 && (
                        <div style={c.msgEmpty}>
                          <div style={{ ...c.msgEmptyAvatar, background: avatarColor(activeChatUser.username) }}>
                            {activeChatUser.username[0].toUpperCase()}
                          </div>
                          <p style={c.msgEmptyText}>Say hello to <strong style={{ color: "#fff" }}>@{activeChatUser.username}</strong></p>
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
                            <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: "2px", }}>
                              <div
                                onMouseEnter={() => setSelectedMsg({ id: msg.id, text: msg.text, from_user: msg.from_user || msg.from, isGroup: !!activeGroup, isMe })}
                                onMouseLeave={() => { setSelectedMsg(null); clearTimeout(longPressTimeout.current); }}
                                onMouseDown={(e) => {
                                  if (msg.optimistic || msg.deleted) return;
                                  const x = e.clientX; const y = e.clientY;
                                  longPressTimeout.current = setTimeout(() => {
                                    setReactionPickerPos({ x, y });
                                    setReactionPickerMsgId(msg.id);
                                    setShowAllEmojis(false);
                                  }, 500);
                                }}
                                onMouseUp={() => clearTimeout(longPressTimeout.current)}
                                onTouchStart={(e) => {
                                  if (msg.optimistic || msg.deleted) return;
                                  e.preventDefault();
                                  const x = e.touches[0].clientX; const y = e.touches[0].clientY;
                                  // Show icons immediately on tap
                                  setSelectedMsg({ id: msg.id, text: msg.text, from_user: msg.from_user || msg.from, isGroup: !!activeGroup, isMe });
                                  clearTimeout(tapTimeout.current);
                                  tapTimeout.current = setTimeout(() => setSelectedMsg(null), 3000);
                                  // Long press → reactions
                                  longPressTimeout.current = setTimeout(() => {
                                    setReactionPickerPos({ x, y });
                                    setReactionPickerMsgId(msg.id);
                                    setShowAllEmojis(false);
                                    setSelectedMsg(null);
                                    clearTimeout(tapTimeout.current);
                                  }, 600);
                                }}
                                onTouchEnd={() => clearTimeout(longPressTimeout.current)}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{
                                  ...c.bubble,
                                  background: msg.deleted ? "rgba(255,255,255,0.04)" : isMe ? (msg.status === "failed" ? "rgba(245,87,108,0.3)" : "linear-gradient(135deg, #667eea, #764ba2)") : "rgba(255,255,255,0.08)",
                                  borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                  opacity: msg.optimistic ? 0.7 : 1,
                                  cursor: "pointer",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  fontStyle: msg.deleted ? "italic" : "normal",
                                }}
                                className="msg-bubble"
                              >
                                {msg.reply_to && (
                                  <div
                                    onMouseDown={(e) => { e.stopPropagation(); clearTimeout(longPressTimeout.current); }}
                                    onMouseUp={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to?.id); }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => { e.stopPropagation(); clearTimeout(longPressTimeout.current); }}
                                    onTouchEnd={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to?.id); }}
                                    style={{ background: "rgba(0,0,0,0.2)", borderLeft: "3px solid rgba(255,255,255,0.4)", borderRadius: "6px", padding: "5px 8px", marginBottom: "6px", fontSize: "12px", cursor: "pointer" }}
                                  >
                                    <div style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700, marginBottom: "2px" }}>↩ @{msg.reply_to.from_user}</div>
                                    <div style={{ color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.reply_to.text}</div>
                                  </div>
                                )}
                                {editingMsgId === msg.id ? (
                                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                    <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(msg.id, false); if (e.key === "Escape") { setEditingMsgId(null); setEditText(""); } }}
                                      style={{ flex: 1, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "8px", color: "#fff", padding: "4px 8px", fontSize: "14px", outline: "none" }}
                                    />
                                    <span onClick={() => saveEdit(msg.id, false)} style={{ cursor: "pointer", fontSize: "16px" }}>✓</span>
                                    <span onClick={() => { setEditingMsgId(null); setEditText(""); }} style={{ cursor: "pointer", fontSize: "14px", opacity: 0.5 }}>✕</span>
                                  </div>
                                ) : msg.deleted ? (
                                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", fontStyle: "italic" }}>🚫 This message was deleted</span>
                                ) : msg.text}
                              </div>
                              {msg.edited && !msg.deleted && (
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", textAlign: isMe ? "right" : "left", paddingLeft: "4px" }}>edited</div>
                              )}
                              {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: isMe ? "flex-end" : "flex-start", paddingLeft: "4px", paddingRight: "4px" }}>
                                  {Object.entries(msg.reactions).map(([emoji, users]) => (
                                    <span key={emoji} onClick={() => toggleReaction(msg.id, emoji, false)} style={{ background: users.includes(currentUser.username) ? "rgba(102,126,234,0.3)" : "rgba(255,255,255,0.08)", border: `1px solid ${users.includes(currentUser.username) ? "rgba(102,126,234,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: "12px", padding: "2px 6px", fontSize: "12px", cursor: "pointer" }}>
                                      {emoji} {users.length}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: "3px", paddingLeft: "4px", paddingRight: "4px" }}>
                                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{formatTime(msg)}</span>
                                {isMe && !msg.deleted && statusTick(msg.status)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Group messages */}
                  {activeGroup && (
                    <>
                      {groupHasMore && (
                        <div style={{ textAlign: "center", padding: "10px" }}>
                          <button onClick={loadMoreGroup} type="button" style={c.loadMoreBtn}>Load older messages</button>
                        </div>
                      )}
                      {groupMessages.length === 0 && (
                        <div style={c.msgEmpty}>
                          <div style={{ ...c.msgEmptyAvatar, background: avatarColor(activeGroup.name) }}>
                            {activeGroup.name[0].toUpperCase()}
                          </div>
                          <p style={c.msgEmptyText}>Start the conversation in <strong style={{ color: "#fff" }}>{activeGroup.name}</strong></p>
                        </div>
                      )}
                      {groupMessages.map((msg, i) => {
                        const isMe = msg.from_user === currentUser.username;
                        return (
                          <div key={msg.id || i} id={`msg-${msg.id}`} style={{ ...c.msgRow, justifyContent: isMe ? "flex-end" : "flex-start", borderRadius: "8px", transition: "background 0.3s" }}>
                            {!isMe && (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                <div style={{ ...c.msgAvatar, background: avatarColor(msg.from_user) }}>
                                  {msg.from_user[0].toUpperCase()}
                                </div>
                              </div>
                            )}
                            <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: "2px", }}>
                              {!isMe && (
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", paddingLeft: "4px" }}>
                                  @{msg.from_user}
                                  {groupMembers.find((m) => m.username === msg.from_user)?.role === "admin" && (
                                    <span style={{ color: "#f6d365", marginLeft: "4px" }}>👑</span>
                                  )}
                                </div>
                              )}
                              <div
                                style={{
                                  ...c.bubble,
                                  background: isMe ? "linear-gradient(135deg, #667eea, #764ba2)" : "rgba(255,255,255,0.08)",
                                  borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                  opacity: msg.optimistic ? 0.7 : 1,
                                  cursor: "pointer",
                                  position: "relative",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                }}
                                onMouseEnter={() => setSelectedMsg({ id: msg.id, text: msg.text, from_user: msg.from_user || msg.from, isGroup: !!activeGroup, isMe })}
                                onMouseLeave={() => { setSelectedMsg(null); clearTimeout(longPressTimeout.current); }}
                                onMouseDown={(e) => {
                                  if (msg.optimistic || msg.deleted) return;
                                  const x = e.clientX; const y = e.clientY;
                                  longPressTimeout.current = setTimeout(() => {
                                    setReactionPickerPos({ x, y });
                                    setReactionPickerMsgId(msg.id);
                                    setShowAllEmojis(false);
                                  }, 500);
                                }}
                                onMouseUp={() => clearTimeout(longPressTimeout.current)}
                                onTouchStart={(e) => {
                                  if (msg.optimistic || msg.deleted) return;
                                  e.preventDefault();
                                  setSelectedMsg({ id: msg.id, text: msg.text, from_user: msg.from_user || msg.from, isGroup: !!activeGroup, isMe });
                                  const x = e.touches[0].clientX; const y = e.touches[0].clientY;
                                  longPressTimeout.current = setTimeout(() => {
                                    setReactionPickerPos({ x, y });
                                    setReactionPickerMsgId(msg.id);
                                    setShowAllEmojis(false);
                                    setSelectedMsg(null);
                                  }, 500);
                                }}
                                onTouchEnd={() => clearTimeout(longPressTimeout.current)}
                                onContextMenu={(e) => e.preventDefault()}
                              >
                                {msg.reply_to && (
                                  <div
                                    onMouseDown={(e) => { e.stopPropagation(); clearTimeout(longPressTimeout.current); }}
                                    onMouseUp={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to?.id); }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => { e.stopPropagation(); clearTimeout(longPressTimeout.current); }}
                                    onTouchEnd={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to?.id); }}
                                    style={{ background: "rgba(0,0,0,0.2)", borderLeft: "3px solid rgba(255,255,255,0.4)", borderRadius: "6px", padding: "5px 8px", marginBottom: "6px", fontSize: "12px", cursor: "pointer" }}
                                  >
                                    <div style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700, marginBottom: "2px" }}>↩ @{msg.reply_to.from_user}</div>
                                    <div style={{ color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.reply_to.text}</div>
                                  </div>
                                )}
                                {editingMsgId === msg.id ? (
                                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                    <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(msg.id, false); if (e.key === "Escape") { setEditingMsgId(null); setEditText(""); } }}
                                      style={{ flex: 1, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "8px", color: "#fff", padding: "4px 8px", fontSize: "14px", outline: "none" }}
                                    />
                                    <span onClick={() => saveEdit(msg.id, false)} style={{ cursor: "pointer", fontSize: "16px" }}>✓</span>
                                    <span onClick={() => { setEditingMsgId(null); setEditText(""); }} style={{ cursor: "pointer", fontSize: "14px", opacity: 0.5 }}>✕</span>
                                  </div>
                                ) : msg.deleted ? (
                                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", fontStyle: "italic" }}>🚫 This message was deleted</span>
                                ) : msg.text}
                              </div>
                              {msg.edited && !msg.deleted && (
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", textAlign: isMe ? "right" : "left", paddingLeft: "4px" }}>edited</div>
                              )}
                              {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: isMe ? "flex-end" : "flex-start", paddingLeft: "4px", paddingRight: "4px" }}>
                                  {Object.entries(msg.reactions).map(([emoji, users]) => (
                                    <span key={emoji} onClick={() => toggleReaction(msg.id, emoji, true)} style={{ background: users.includes(currentUser.username) ? "rgba(102,126,234,0.3)" : "rgba(255,255,255,0.08)", border: `1px solid ${users.includes(currentUser.username) ? "rgba(102,126,234,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: "12px", padding: "2px 6px", fontSize: "12px", cursor: "pointer" }}>
                                      {emoji} {users.length}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: "3px", paddingLeft: "4px" }}>
                                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{formatTime(msg)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* ── REPLY PREVIEW ── */}
                {replyTo && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px 0", background: "rgba(19,19,42,0.98)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ flex: 1, background: "rgba(102,126,234,0.1)", borderLeft: "3px solid #667eea", borderRadius: "8px", padding: "6px 10px" }}>
                      <div style={{ fontSize: "11px", color: "#667eea", fontWeight: 700, marginBottom: "2px" }}>↩ Replying to @{replyTo.from_user}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{replyTo.text}</div>
                    </div>
                    <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "16px", padding: "4px" }}>✕</button>
                  </div>
                )}

                {/* ── INPUT ── */}
                <div style={c.inputBar}>
                  <input
                    ref={inputRef}
                    style={c.input}
                    placeholder={
                      activeChatUser
                        ? `Message @${activeChatUser.username}…`
                        : activeGroup
                        ? `Message ${activeGroup.name}…`
                        : "Type a message…"
                    }
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
              </div>

              {/* ── MEMBERS PANEL (group only) ── */}
              {activeGroup && showMembersPanel && (
                <div
                  className="members-panel"
                  style={{
                  width: "220px", borderLeft: "1px solid rgba(255,255,255,0.07)",
                  background: "#13132a", display: "flex", flexDirection: "column",
                  flexShrink: 0, overflowY: "auto",
                }}>
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px" }}>MEMBERS ({groupMembers.length})</span>
                    {isGroupAdmin && (
                      <button
                        onClick={() => setShowAddMembers(true)}
                        style={{ background: "rgba(67,233,123,0.15)", border: "1px solid rgba(67,233,123,0.3)", borderRadius: "6px", color: "#43e97b", padding: "3px 8px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
                      >+ Add</button>
                    )}
                  </div>
                  {groupMembers.map((m) => (
                    <div key={m.username} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px" }}>
                      <div style={{ ...c.msgAvatar, width: "32px", height: "32px", fontSize: "12px", background: avatarColor(m.username), flexShrink: 0 }}>
                        {m.username[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          @{m.username}
                          {m.username === currentUser.username && <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}> (you)</span>}
                        </div>
                        <div style={{ fontSize: "11px", color: m.role === "admin" ? "#f6d365" : "rgba(255,255,255,0.3)" }}>
                          {m.role === "admin" ? "👑 Admin" : "Member"}
                        </div>
                      </div>
                      {/* Promote button — only admins see it, only for non-admins */}
                      {isGroupAdmin && m.username !== currentUser.username && (() => {
                        const memberIsCreator = activeGroup?.created_by === m.username;
                        const memberIsAdmin = m.role === "admin";
                        // Creator can do everything; regular admin can only act on members
                        const canAct = isGroupCreator || !memberIsAdmin;
                        if (!canAct) return null;
                        return (
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            {!memberIsAdmin && (
                              <button
                                onClick={() => promoteToAdmin(m.username)}
                                title="Promote to Admin"
                                style={{
                                  background: "rgba(246,211,101,0.1)", border: "1px solid rgba(246,211,101,0.3)",
                                  borderRadius: "6px", color: "#f6d365", fontSize: "10px",
                                  padding: "3px 6px", cursor: "pointer",
                                }}
                              >👑</button>
                            )}
                            {memberIsAdmin && isGroupCreator && (
                              <button
                                onClick={() => demoteAdmin(m.username)}
                                title="Demote to Member"
                                style={{
                                  background: "rgba(255,165,0,0.1)", border: "1px solid rgba(255,165,0,0.3)",
                                  borderRadius: "6px", color: "#ffa500", fontSize: "10px",
                                  padding: "3px 6px", cursor: "pointer",
                                }}
                              >⬇️</button>
                            )}
                            {!memberIsCreator && (
                              <button
                                onClick={() => removeMember(m.username)}
                                title="Remove from Group"
                                style={{
                                  background: "rgba(245,87,108,0.1)", border: "1px solid rgba(245,87,108,0.3)",
                                  borderRadius: "6px", color: "#f5576c", fontSize: "10px",
                                  padding: "3px 6px", cursor: "pointer",
                                }}
                              >✕</button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
  loadMoreBtn: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "20px", color: "rgba(255,255,255,0.5)", padding: "6px 18px", fontSize: "12px", cursor: "pointer" },
  msgEmpty: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" },
  msgEmptyAvatar: { width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 700, color: "#fff" },
  msgEmptyText: { color: "rgba(255,255,255,0.35)", fontSize: "15px" },
  msgRow: { display: "flex", alignItems: "flex-end", gap: "8px" },
  msgAvatar: { width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#fff", flexShrink: 0 },
  bubble: { padding: "10px 16px", fontSize: "14px", lineHeight: 1.5, color: "#fff", wordBreak: "break-word" },
  inputBar: { display: "flex", gap: "10px", padding: "12px 16px", background: "rgba(19,19,42,0.98)", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  input: { flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "14px", padding: "12px 16px", outline: "none" },
  sendBtn: { width: "46px", height: "46px", borderRadius: "12px", background: "linear-gradient(135deg, #667eea, #764ba2)", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer", flexShrink: 0, transition: "opacity 0.2s" },
  headerActionBtn: { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", color: "#fff", padding: "6px 10px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" },
};
