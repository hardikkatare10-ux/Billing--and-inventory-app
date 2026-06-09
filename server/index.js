import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const SESSION_SECRET = process.env.SESSION_SECRET || "replace-this-session-secret";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const dbFile = path.resolve(process.cwd(), "server", "data.json");
if (!fs.existsSync(dbFile)) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(dbFile, JSON.stringify({ users: [] }, null, 2));
}

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: [] });
await db.read();

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

const normalizePhone = (value) => value?.toString().replace(/\D/g, "").slice(-10);
const getUserByUsername = (username) => db.data.users.find((user) => user.username === username);
const isValidPassword = (value) => typeof value === "string" && /^682\d+$/.test(value);

app.get("/api/auth/me", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(200).json({ user: null });
  }

  await db.read();
  const user = db.data.users.find((item) => item.id === userId);
  if (!user) {
    return res.status(200).json({ user: null });
  }

  return res.status(200).json({ user: { username: user.username, shopName: user.shopName, phone: user.phone } });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, shopName, phone, password } = req.body;
  if (!username || !shopName || !phone || !password) {
    return res.status(400).json({ error: "All registration fields are required." });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must start with 682 and contain only digits." });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  await db.read();

  if (getUserByUsername(normalizedUsername)) {
    return res.status(409).json({ error: "Username is already in use." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: `${normalizedUsername}-${Date.now()}`,
    username: normalizedUsername,
    shopName: shopName.trim(),
    phone: normalizedPhone,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(user);
  await db.write();

  req.session.userId = user.id;
  return res.status(201).json({ user: { username: user.username, shopName: user.shopName, phone: user.phone } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const normalizedUsername = username.trim().toLowerCase();
  await db.read();
  const user = getUserByUsername(normalizedUsername);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  req.session.userId = user.id;
  return res.status(200).json({ user: { username: user.username, shopName: user.shopName, phone: user.phone } });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { username, shopName, phone, newPassword } = req.body;
  if (!username || !shopName || !phone || !newPassword) {
    return res.status(400).json({ error: "All fields are required to reset the password." });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: "New password must start with 682 and contain only digits." });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  await db.read();

  const user = db.data.users.find(
    (item) => item.username === normalizedUsername && item.shopName === shopName.trim() && item.phone === normalizedPhone
  );

  if (!user) {
    return res.status(404).json({ error: "No account matches the provided information." });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await db.write();

  return res.status(200).json({ message: "Password reset completed successfully." });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Logout failed." });
    }
    res.clearCookie("connect.sid");
    return res.status(200).json({ success: true });
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Authentication server running on http://localhost:${PORT}`);
});
