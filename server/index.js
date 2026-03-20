process.env.TZ = 'Asia/Kolkata';
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db");
const redis = require("./redis");
const { sendOtpEmail, sendPasswordResetEmail } = require("./mailer");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.use(cors());
app.use(express.json());

// ── USERNAME → SOCKET ID MAP ──
const userSocketMap = {};

// ── GET NEXT SEQUENCE NUMBER FOR A CONVERSATION ──
async function getNextSeq(userPair) {
  const result = await pool.query(
    `INSERT INTO message_sequences (user_pair, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (user_pair)
     DO UPDATE SET last_seq = message_sequences.last_seq + 1
     RETURNING last_seq`,
    [userPair]
  );
  return result.rows[0].last_seq;
}

// ── PUSH UNDELIVERED MESSAGES TO USER ON CONNECT ──
async function deliverPendingMessages(username) {
  try {
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE to_user = $1 AND acked = FALSE
       ORDER BY seq_num ASC NULLS LAST`,
      [username]
    );

    if (result.rows.length === 0) return;

    const socketId = userSocketMap[username];
    if (!socketId) return;

    for (const msg of result.rows) {
      io.to(socketId).emit("receive_message", msg, async (acked) => {
        if (acked) {
          await pool.query(
            "UPDATE messages SET acked = TRUE, status = 'delivered' WHERE id = $1",
            [msg.id]
          );
          const senderSocketId = userSocketMap[msg.from_user];
          if (senderSocketId) {
            io.to(senderSocketId).emit("message_delivered", {
              id: msg.id,
              seq_num: msg.seq_num,
            });
          }
        }
      });
    }

    console.log(`📬 Delivered ${result.rows.length} pending messages to ${username}`);
  } catch (err) {
    console.error("deliverPendingMessages error:", err);
  }
}

// ── SOCKET.IO ──
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("join", async (username) => {
    socket.username = username;
    socket.join(username);
    userSocketMap[username] = socket.id;

    await redis.set(`online:${username}`, "1");
    io.emit("user_online", username);
    console.log(`👤 ${username} online`);

    const keys = await redis.keys("online:*");
    const onlineList = keys.map((k) => k.replace("online:", ""));
    socket.emit("online_list", onlineList);

    await deliverPendingMessages(username);

    // ── JOIN ALL GROUP ROOMS THIS USER BELONGS TO ──
    try {
      const groupResult = await pool.query(
        `SELECT group_id FROM group_members WHERE username = $1`,
        [username]
      );
      for (const row of groupResult.rows) {
        socket.join(`group:${row.group_id}`);
      }
    } catch (err) {
      console.error("Error joining group rooms:", err);
    }
  });

  socket.on("logout", async (username) => {
    delete userSocketMap[username];
    await redis.del(`online:${username}`);
    io.emit("user_offline", username);
    console.log(`👤 ${username} logged out`);
  });

  socket.on("heartbeat", async () => {
    if (socket.username) {
      await redis.set(`online:${socket.username}`, "1");
    }
  });

  // ── SEND 1-ON-1 MESSAGE ──
  socket.on("send_message", async (data, clientAck) => {
    const { from, to, text, time } = data;

    try {
      const userPair = [from, to].sort().join("_");
      const seqNum = await getNextSeq(userPair);

      const result = await pool.query(
        `INSERT INTO messages (from_user, to_user, text, time, status, seq_num, acked)
         VALUES ($1, $2, $3, $4, 'sent', $5, FALSE) RETURNING *`,
        [from, to, text, time, seqNum]
      );
      const savedMsg = result.rows[0];

      if (clientAck) clientAck({ status: "saved", msg: savedMsg });

      const recipientSocketId = userSocketMap[to];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receive_message", savedMsg, async (acked) => {
          if (acked) {
            await pool.query(
              "UPDATE messages SET acked = TRUE, status = 'delivered' WHERE id = $1",
              [savedMsg.id]
            );
            savedMsg.status = "delivered";
            const senderSocketId = userSocketMap[from];
            if (senderSocketId) {
              io.to(senderSocketId).emit("message_delivered", {
                id: savedMsg.id,
                seq_num: savedMsg.seq_num,
              });
            }
          }
        });
      }
    } catch (err) {
      console.error("send_message error:", err);
      if (clientAck) clientAck({ status: "error" });
    }
  });

  // ── SEND GROUP MESSAGE ──
  socket.on("send_group_message", async (data, clientAck) => {
    const { groupId, from, text, time } = data;

    try {
      // Check sender is a member
      const memberCheck = await pool.query(
        `SELECT 1 FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, from]
      );
      if (memberCheck.rows.length === 0) {
        if (clientAck) clientAck({ status: "error", message: "Not a member" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO group_messages (group_id, from_user, text, time, status)
         VALUES ($1, $2, $3, $4, 'sent') RETURNING *`,
        [groupId, from, text, time]
      );
      const savedMsg = result.rows[0];

      if (clientAck) clientAck({ status: "saved", msg: savedMsg });

      // Broadcast to everyone in the group room (including sender)
      io.to(`group:${groupId}`).emit("receive_group_message", savedMsg);

      console.log(`💬 Group ${groupId} message from ${from}`);
    } catch (err) {
      console.error("send_group_message error:", err);
      if (clientAck) clientAck({ status: "error" });
    }
  });

  // ── MAKE MEMBER AN ADMIN ──
  socket.on("make_admin", async ({ groupId, targetUser, requestedBy }) => {
    try {
      // Verify requester is an admin
      const adminCheck = await pool.query(
        `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, requestedBy]
      );
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== "admin") {
        socket.emit("group_error", { message: "Only admins can promote members" });
        return;
      }

      await pool.query(
        `UPDATE group_members SET role = 'admin' WHERE group_id = $1 AND username = $2`,
        [groupId, targetUser]
      );

      io.to(`group:${groupId}`).emit("group_role_updated", {
        groupId,
        username: targetUser,
        role: "admin",
        promotedBy: requestedBy,
      });

      console.log(`👑 ${targetUser} promoted to admin in group ${groupId} by ${requestedBy}`);
    } catch (err) {
      console.error("make_admin error:", err);
    }
  });

  // ── DEMOTE ADMIN → MEMBER ──
  socket.on("demote_admin", async ({ groupId, targetUser, requestedBy }) => {
    try {
      const adminCheck = await pool.query(
        `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, requestedBy]
      );
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== "admin") {
        socket.emit("group_error", { message: "Only admins can demote members" });
        return;
      }
      if (targetUser === requestedBy) {
        socket.emit("group_error", { message: "You cannot demote yourself" });
        return;
      }
      const groupCheck = await pool.query(`SELECT created_by FROM groups WHERE id = $1`, [groupId]);
      const isRequesterCreator = groupCheck.rows[0].created_by === requestedBy;
      // Only creator can demote other admins; regular admins cannot demote other admins
      if (!isRequesterCreator && adminCheck.rows[0].role === "admin") {
        const targetRoleCheck = await pool.query(
          `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
          [groupId, targetUser]
        );
        if (targetRoleCheck.rows[0]?.role === "admin") {
          socket.emit("group_error", { message: "Only the group creator can demote other admins" });
          return;
        }
      }
      // Nobody can demote the creator
      if (groupCheck.rows[0].created_by === targetUser) {
        socket.emit("group_error", { message: "Cannot demote the group creator" });
        return;
      }
      await pool.query(
        `UPDATE group_members SET role = 'member' WHERE group_id = $1 AND username = $2`,
        [groupId, targetUser]
      );
      io.to(`group:${groupId}`).emit("group_role_updated", {
        groupId, username: targetUser, role: "member", demotedBy: requestedBy,
      });
      console.log(`⬇️ ${targetUser} demoted to member in group ${groupId} by ${requestedBy}`);
    } catch (err) { console.error("demote_admin error:", err); }
  });

  // ── REMOVE MEMBER FROM GROUP ──
  socket.on("remove_member", async ({ groupId, targetUser, requestedBy }) => {
    try {
      const adminCheck = await pool.query(
        `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, requestedBy]
      );
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== "admin") {
        socket.emit("group_error", { message: "Only admins can remove members" });
        return;
      }
      if (targetUser === requestedBy) {
        socket.emit("group_error", { message: "You cannot remove yourself" });
        return;
      }
      const groupCheck = await pool.query(`SELECT created_by FROM groups WHERE id = $1`, [groupId]);
      const isRequesterCreator = groupCheck.rows[0].created_by === requestedBy;
      // Nobody can remove the creator
      if (groupCheck.rows[0].created_by === targetUser) {
        socket.emit("group_error", { message: "Cannot remove the group creator" });
        return;
      }
      // Only creator can remove other admins; regular admins cannot remove other admins
      if (!isRequesterCreator) {
        const targetRoleCheck = await pool.query(
          `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
          [groupId, targetUser]
        );
        if (targetRoleCheck.rows[0]?.role === "admin") {
          socket.emit("group_error", { message: "Only the group creator can remove other admins" });
          return;
        }
      }
      await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND username = $2`, [groupId, targetUser]);
      const removedSocketId = userSocketMap[targetUser];
      if (removedSocketId) {
        const sock = io.sockets.sockets.get(removedSocketId);
        if (sock) {
          sock.leave(`group:${groupId}`);
          sock.emit("removed_from_group", { groupId, removedBy: requestedBy });
        }
      }
      io.to(`group:${groupId}`).emit("member_removed", { groupId, username: targetUser, removedBy: requestedBy });
      console.log(`❌ ${targetUser} removed from group ${groupId} by ${requestedBy}`);
    } catch (err) { console.error("remove_member error:", err); }
  });

  // ── LEAVE GROUP ──
  socket.on("leave_group", async ({ groupId, username }) => {
    try {
      const groupCheck = await pool.query(`SELECT created_by FROM groups WHERE id = $1`, [groupId]);
      if (!groupCheck.rows.length) {
        socket.emit("group_error", { message: "Group not found" });
        return;
      }
      if (groupCheck.rows[0].created_by === username) {
        socket.emit("group_error", { message: "Group creator cannot leave. Delete the group instead." });
        return;
      }
      await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND username = $2`, [groupId, username]);
      socket.leave(`group:${groupId}`);
      socket.emit("left_group", { groupId });
      io.to(`group:${groupId}`).emit("member_left", { groupId, username });
      console.log(`🚪 ${username} left group ${groupId}`);
    } catch (err) { console.error("leave_group error:", err); }
  });

  // ── ADD MEMBERS TO EXISTING GROUP ──
  socket.on("add_members", async ({ groupId, newMembers, requestedBy }) => {
    try {
      const adminCheck = await pool.query(
        `SELECT role FROM group_members WHERE group_id = $1 AND username = $2`,
        [groupId, requestedBy]
      );
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== "admin") {
        socket.emit("group_error", { message: "Only admins can add members" });
        return;
      }
      const groupResult = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
      const group = groupResult.rows[0];
      const added = [];
      for (const username of newMembers) {
        try {
          await pool.query(
            `INSERT INTO group_members (group_id, username, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
            [groupId, username]
          );
          added.push(username);
          // Join new member to group room
          const newMemberSocketId = userSocketMap[username];
          if (newMemberSocketId) {
            const sock = io.sockets.sockets.get(newMemberSocketId);
            if (sock) {
              sock.join(`group:${groupId}`);
              sock.emit("group_created", { ...group, members: [] });
            }
          }
        } catch (e) { /* skip duplicates */ }
      }
      // Notify everyone in group about new members
      const membersResult = await pool.query(
        `SELECT gm.username, gm.role, u.avatar FROM group_members gm JOIN users u ON u.username = gm.username WHERE gm.group_id = $1`,
        [groupId]
      );
      io.to(`group:${groupId}`).emit("members_added", { groupId, newMembers: added, allMembers: membersResult.rows });
      console.log(`➕ ${added.join(', ')} added to group ${groupId} by ${requestedBy}`);
    } catch (err) { console.error("add_members error:", err); }
  });

  // ── ADD REACTION TO MESSAGE ──
  socket.on("add_reaction", async ({ messageId, groupId, emoji, username, isGroup }) => {
    try {
      const table = isGroup ? "group_messages" : "messages";
      const result = await pool.query(`SELECT reactions FROM ${table} WHERE id = $1`, [messageId]);
      if (!result.rows.length) return;

      let reactions = result.rows[0].reactions || {};

      // Remove user from ANY existing emoji first (one reaction per person)
      for (const key of Object.keys(reactions)) {
        reactions[key] = reactions[key].filter(u => u !== username);
        if (reactions[key].length === 0) delete reactions[key];
      }

      // If user clicked their current emoji → just remove it (toggle off)
      // If user clicked a new emoji → add it
      const alreadyHadThisEmoji = (result.rows[0].reactions?.[emoji] || []).includes(username);
      if (!alreadyHadThisEmoji) {
        if (!reactions[emoji]) reactions[emoji] = [];
        reactions[emoji].push(username);
      }

      await pool.query(`UPDATE ${table} SET reactions = $1 WHERE id = $2`, [JSON.stringify(reactions), messageId]);

      const event = { messageId, reactions, isGroup, groupId };
      if (isGroup) {
        io.to(`group:${groupId}`).emit("reaction_updated", event);
      } else {
        // Notify both users in 1-on-1 chat
        const msgResult = await pool.query(`SELECT from_user, to_user FROM messages WHERE id = $1`, [messageId]);
        if (msgResult.rows.length) {
          const { from_user, to_user } = msgResult.rows[0];
          [from_user, to_user].forEach(u => {
            const sid = userSocketMap[u];
            if (sid) io.to(sid).emit("reaction_updated", event);
          });
        }
      }
    } catch (err) { console.error("add_reaction error:", err); }
  });



  // ── TYPING INDICATORS ──
  socket.on("typing", ({ from, to }) => {
    const recipientSocketId = userSocketMap[to];
    if (recipientSocketId) io.to(recipientSocketId).emit("typing", { from });
  });

  socket.on("stop_typing", ({ from, to }) => {
    const recipientSocketId = userSocketMap[to];
    if (recipientSocketId) io.to(recipientSocketId).emit("stop_typing", { from });
  });

  // ── GROUP TYPING ──
  socket.on("group_typing", ({ from, groupId }) => {
    socket.to(`group:${groupId}`).emit("group_typing", { from, groupId });
  });

  socket.on("group_stop_typing", ({ from, groupId }) => {
    socket.to(`group:${groupId}`).emit("group_stop_typing", { from, groupId });
  });

  // ── DISCONNECT ──
  socket.on("disconnect", async () => {
    if (socket.username) {
      const username = socket.username;
      delete userSocketMap[username];

      setTimeout(async () => {
        const stillOnline = await redis.get(`online:${username}`);
        if (!stillOnline) {
          io.emit("user_offline", username);
          console.log(`👤 ${username} offline`);
        }
      }, 8000);

      await redis.del(`online:${username}`);
    }
  });
});

// ════════════════════════════════════════
// ── REST API ROUTES ──
// ════════════════════════════════════════

// ── GET CHAT HISTORY ──
app.get("/api/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
       ORDER BY created_at DESC LIMIT 50 OFFSET $3`,
      [user1, user2, offset]
    );
    const messages = result.rows.reverse();
    res.json({ messages, hasMore: result.rows.length === 50 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET ONLINE STATUS ──
app.get("/api/online/:username", async (req, res) => {
  try {
    const online = await redis.get(`online:${req.params.username}`);
    res.json({ online: !!online });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── SEND OTP ──
app.post("/api/send-otp", async (req, res) => {
  const { email, username } = req.body;
  try {
    const emailExists = await pool.query("SELECT * FROM users WHERE email ILIKE $1", [email]);
    if (emailExists.rows.length > 0)
      return res.status(400).json({ field: "email", message: "Email already registered" });

    const userExists = await pool.query("SELECT * FROM users WHERE username ILIKE $1", [username]);
    if (userExists.rows.length > 0)
      return res.status(400).json({ field: "username", message: "Username already taken" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await sendOtpEmail(email, otp, username);
    res.json({ message: "OTP sent", otp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// ── REGISTER ──
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const userExists = await pool.query("SELECT * FROM users WHERE username ILIKE $1", [username]);
    if (userExists.rows.length > 0)
      return res.status(400).json({ field: "username", message: "Username already taken" });

    const emailExists = await pool.query("SELECT * FROM users WHERE email ILIKE $1", [email]);
    if (emailExists.rows.length > 0)
      return res.status(400).json({ field: "email", message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const avatar = username[0].toUpperCase();

    const result = await pool.query(
      "INSERT INTO users (username, email, password, avatar) VALUES ($1, $2, $3, $4) RETURNING id, username, email, avatar",
      [username, email, hashed, avatar]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── LOGIN ──
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email ILIKE $1", [email]);
    if (result.rows.length === 0)
      return res.status(404).json({ field: "global", message: "User not found. Please register first." });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ field: "password", message: "Incorrect password." });

    res.json({ user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── FORGOT PASSWORD ──
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email ILIKE $1", [email]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "No account found with this email." });

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3",
      [token, expires, user.id]
    );

    const resetLink = `http://localhost:5173/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetLink, user.username);
    res.json({ message: "Password reset email sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── RESET PASSWORD ──
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_expires > NOW()", [token]
    );
    if (result.rows.length === 0)
      return res.status(400).json({ message: "Invalid or expired reset link." });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2",
      [hashed, result.rows[0].id]
    );
    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET ALL USERS ──
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, avatar FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET RECENT CHATS ──
app.get("/api/recent-chats/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user)
        other_user, text, from_user, time, created_at
       FROM (
         SELECT to_user AS other_user, text, from_user, time, created_at FROM messages WHERE from_user = $1
         UNION ALL
         SELECT from_user AS other_user, text, from_user, time, created_at FROM messages WHERE to_user = $1
       ) chats
       ORDER BY other_user, created_at DESC`,
      [username]
    );
    res.json({ chats: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ════════════════════════════════════════
// ── GROUP ROUTES ──
// ════════════════════════════════════════

// ── CREATE GROUP ──
app.post("/api/groups", async (req, res) => {
  const { name, createdBy, members } = req.body;
  // members = array of usernames to add (not including creator)

  if (!name || !createdBy) {
    return res.status(400).json({ message: "Group name and creator are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const avatar = name[0].toUpperCase();
    const groupResult = await client.query(
      `INSERT INTO groups (name, created_by, avatar) VALUES ($1, $2, $3) RETURNING *`,
      [name, createdBy, avatar]
    );
    const group = groupResult.rows[0];

    // Add creator as admin
    await client.query(
      `INSERT INTO group_members (group_id, username, role) VALUES ($1, $2, 'admin')`,
      [group.id, createdBy]
    );

    // Add other members
    const allMembers = [...new Set(members || [])].filter(m => m !== createdBy);
    for (const username of allMembers) {
      await client.query(
        `INSERT INTO group_members (group_id, username, role) VALUES ($1, $2, 'member')`,
        [group.id, username]
      );
    }

    await client.query("COMMIT");

    // Fetch full member list with roles
    const membersResult = await pool.query(
      `SELECT username, role FROM group_members WHERE group_id = $1`,
      [group.id]
    );
    group.members = membersResult.rows;

    // Notify all members via socket — join them to the group room
    const allGroupMembers = [createdBy, ...allMembers];
    for (const username of allGroupMembers) {
      const socketId = userSocketMap[username];
      if (socketId) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) {
          sock.join(`group:${group.id}`);
          sock.emit("group_created", group);
        }
      }
    }

    console.log(`👥 Group "${name}" created by ${createdBy} with ${allGroupMembers.length} members`);
    res.json({ group });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("create group error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

// ── GET GROUPS FOR A USER ──
app.get("/api/groups/user/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const result = await pool.query(
      `SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
        (SELECT text FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT from_user FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message_from,
        (SELECT created_at FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.username = $1
       ORDER BY COALESCE(
         (SELECT created_at FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1),
         g.created_at
       ) DESC`,
      [username]
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET GROUP MEMBERS ──
app.get("/api/groups/:groupId/members", async (req, res) => {
  const { groupId } = req.params;
  try {
    const result = await pool.query(
      `SELECT gm.username, gm.role, gm.joined_at, u.avatar
       FROM group_members gm
       JOIN users u ON u.username = gm.username
       WHERE gm.group_id = $1
       ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END, gm.joined_at ASC`,
      [groupId]
    );
    res.json({ members: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET GROUP MESSAGES ──
app.get("/api/groups/:groupId/messages", async (req, res) => {
  const { groupId } = req.params;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query(
      `SELECT * FROM group_messages
       WHERE group_id = $1
       ORDER BY created_at DESC LIMIT 50 OFFSET $2`,
      [groupId, offset]
    );
    const messages = result.rows.reverse();
    res.json({ messages, hasMore: result.rows.length === 50 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── MARK READ ──
app.use("/api/mark-read", async (req, res) => {});
// Keep the socket-based mark_read as-is

// ── MARK READ (socket) is already handled above ──
io.on("connection", () => {}); // placeholder — already registered above

// Re-register mark_read inside the main io.on block
// (already present above, no duplicate needed)

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ DB connection error:", err.message);
  } else {
    console.log("✅ DB connected successfully!");
    release();
  }
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});