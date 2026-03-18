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
          //const chatKey = [msg.from_user, msg.to_user].sort().join("_");
          //await redis.del(`chat:${chatKey}`);

          // Notify sender their message was delivered
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

    // Send all currently online users
    const keys = await redis.keys("online:*");
    const onlineList = keys.map((k) => k.replace("online:", ""));
    socket.emit("online_list", onlineList);

    // Deliver any messages missed while offline
    await deliverPendingMessages(username);
  });

  // Explicit logout — mark offline immediately, no 35s delay
  socket.on("logout", async (username) => {
    delete userSocketMap[username];
    await redis.del(`online:${username}`);
    io.emit("user_offline", username);
    console.log(`👤 ${username} logged out`);
  });

  // Heartbeat
  socket.on("heartbeat", async () => {
    if (socket.username) {
      await redis.set(`online:${socket.username}`, "1");
    }
  });

  // ── SEND MESSAGE ──
  socket.on("send_message", async (data, clientAck) => {
    const { from, to, text, time } = data;

    try {
      const userPair = [from, to].sort().join("_");
      const seqNum = await getNextSeq(userPair);

      // Save to PostgreSQL FIRST — message is NEVER lost
      const result = await pool.query(
        `INSERT INTO messages (from_user, to_user, text, time, status, seq_num, acked)
         VALUES ($1, $2, $3, $4, 'sent', $5, FALSE) RETURNING *`,
        [from, to, text, time, seqNum]
      );
      const savedMsg = result.rows[0];

      // Cache in Redis
      //const chatKey = [from, to].sort().join("_");
      //await redis.lpush(`chat:${chatKey}`, JSON.stringify(savedMsg));
      //await redis.ltrim(`chat:${chatKey}`, 0, 49);

      // Confirm save to sender immediately (optimistic UI — no waiting)
      if (clientAck) clientAck({ status: "saved", msg: savedMsg });

      // Try live delivery to recipient with ACK
      const recipientSocketId = userSocketMap[to];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receive_message", savedMsg, async (acked) => {
          if (acked) {
            await pool.query(
              "UPDATE messages SET acked = TRUE, status = 'delivered' WHERE id = $1",
              [savedMsg.id]
            );
            savedMsg.status = "delivered";
            //await redis.del(`chat:${chatKey}`);

            // Tell sender it was delivered
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
      // If offline → stays in DB with acked=FALSE
      // deliverPendingMessages() replays it when they reconnect

    } catch (err) {
      console.error("send_message error:", err);
      if (clientAck) clientAck({ status: "error" });
    }
  });

  // ── MARK READ ──
  socket.on("mark_read", async ({ from, to }) => {
    const chatKey = [from, to].sort().join("_");

    await pool.query(
      "UPDATE messages SET status = 'read' WHERE from_user = $1 AND to_user = $2 AND status != 'read'",
      [from, to]
    );
    //await redis.del(`chat:${chatKey}`);

    const senderSocketId = userSocketMap[from];
    if (senderSocketId) {
      io.to(senderSocketId).emit("messages_read", { by: to });
    }
  });

  // Typing indicators
  socket.on("typing", ({ from, to }) => {
    const recipientSocketId = userSocketMap[to];
    if (recipientSocketId) io.to(recipientSocketId).emit("typing", { from });
  });

  socket.on("stop_typing", ({ from, to }) => {
    const recipientSocketId = userSocketMap[to];
    if (recipientSocketId) io.to(recipientSocketId).emit("stop_typing", { from });
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

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ DB connection error:", err.message);
  } else {
    console.log("✅ DB connected successfully!");
    release();
  }
});

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

server.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});

