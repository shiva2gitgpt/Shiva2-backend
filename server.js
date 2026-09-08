/*
  SHIVA 2.0 — Authentication + AI Backend
  File: auth server.js

  Stage 1:
  - Signup
  - Login
  - Persistent sessions
  - Logout
  - Multi-account/session management
  - Account profile
  - Password change
  - Password reset foundation
  - User-scoped chats
  - Shiva Memory
  - Projects
  - Incognito isolation
  - Gemini + Groq AI Router
  - Common Shiva AI identity
*/

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --------------------------------------------------
// STORAGE
// --------------------------------------------------

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "shiva.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultDatabase() {
  return {
    users: [],
    sessions: [],
    chats: [],
    memories: [],
    projects: [],
    resetTokens: []
  };
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const db = defaultDatabase();
      saveDatabase(db);
      return db;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...defaultDatabase(),
      ...parsed
    };
  } catch (error) {
    console.error("Database load error:", error);
    return defaultDatabase();
  }
}

let db = loadDatabase();

function saveDatabase(database = db) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function now() {
  return new Date().toISOString();
}

function makeId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function safeText(value, max = 10000) {
  return String(value || "").slice(0, max);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(
    password,
    salt,
    64
  ).toString("hex");

  return {
    salt,
    hash
  };
}

function verifyPassword(password, storedHash, salt) {
  const calculated = crypto.scryptSync(
    password,
    salt,
    64
  ).toString("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(storedHash, "hex");

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function generateToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

function publicUser(user) {
  if (!user) return null;

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email || null,
    phone: user.phone || null,
    display_name: user.display_name || user.username,
    avatar: user.avatar || null,
    role: user.role || "user",
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function publicSession(session) {
  return {
    session_id: session.session_id,
    user_id: session.user_id,
    device_name: session.device_name || "Unknown device",
    created_at: session.created_at,
    last_seen: session.last_seen,
    current: false
  };
}

// --------------------------------------------------
// VALIDATION
// --------------------------------------------------

function validateUsername(username) {
  const value = String(username || "").trim();

  if (value.length < 4 || value.length > 20) {
    return "Username must be 4–20 characters.";
  }

  if (!/^[A-Za-z0-9_@]+$/.test(value)) {
    return "Username can contain only letters, numbers, _ and @.";
  }

  if (/^[_@]+$/.test(value)) {
    return "Username cannot contain only _ or @.";
  }

  const reserved = [
    "admin",
    "administrator",
    "root",
    "system",
    "support",
    "shiva",
    "shiva2",
    "shivaai",
    "official",
    "security",
    "moderator",
    "moderator",
    "api",
    "null",
    "undefined"
  ];

  if (reserved.includes(value.toLowerCase())) {
    return "This username is reserved.";
  }

  return null;
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < 5 || value.length > 25) {
    return "Password must be 5–25 characters.";
  }

  return null;
}

function validateEmail(email) {
  if (!email) return null;

  const value = normalizeEmail(email);

  if (value.length > 254) {
    return "Email is too long.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Invalid email address.";
  }

  return null;
}

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

function createSession(userId, req) {
  const session = {
    session_id: makeId("sess"),
    user_id: userId,

    // Persistent session.
    // No arbitrary 30-day forced expiration.
    token: generateToken(48),

    device_name:
      req.body?.device_name ||
      req.headers["user-agent"] ||
      "Unknown device",

    created_at: now(),
    last_seen: now()
  };

  db.sessions.push(session);
  saveDatabase();

  return session;
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || "";

  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return req.headers["x-session-token"] || null;
}

function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required."
    });
  }

  const session = db.sessions.find(
    item => item.token === token
  );

  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Invalid session."
    });
  }

  const user = db.users.find(
    item => item.user_id === session.user_id
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Account no longer exists."
    });
  }

  session.last_seen = now();
  saveDatabase();

  req.user = user;
  req.session = session;

  next();
}

// --------------------------------------------------
// SHIVA IDENTITY
// --------------------------------------------------

const SHIVA_IDENTITY = `
You are Shiva AI inside Shiva 2.0.

You are part of the Shiva 2.0 platform.

SHIVA is the developer and creator of the Shiva 2.0 platform.

The selected AI provider is only the underlying engine used to generate the response.
The provider is not the developer or creator of Shiva AI.

If the user asks who developed or created Shiva AI, explain that Shiva AI was developed by SHIVA as part of Shiva 2.0.

Never infer that a person is SHIVA merely because their name or username is Shiva.

Authenticated user identity is determined by the server-side account user_id.

Maintain continuity with the user's authorized context when available.

Do not expose private server secrets, API keys, password hashes, session tokens, or internal authentication data.
`;

// --------------------------------------------------
// PROVIDERS
// --------------------------------------------------

const PROVIDERS = {
  gemini: {
    name: "Gemini",
    model: "gemini-3.6-flash"
  },
  groq: {
    name: "Groq",
    model: "openai/gpt-oss-120b"
  },
  luna: {
    name: "OpenAI Luna",
    model: "gpt-5.6-luna"
  }
};

function providerAvailable(provider) {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (provider === "luna") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-30)
    .map(item => ({
      role:
        item.role === "assistant"
          ? "assistant"
          : "user",

      content: safeText(item.content, 12000)
    }))
    .filter(item => item.content.trim());
}

// --------------------------------------------------
// GEMINI
// --------------------------------------------------

async function callGemini(message, history = [], context = "") {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini provider is not configured.");
  }

  const contents = [
    ...cleanHistory(history).map(item => ({
      type: "text",
      text: `${item.role}: ${item.content}`
    })),

    {
      type: "text",
      text: message
    }
  ];

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        model: PROVIDERS.gemini.model,

        system_instruction: `${SHIVA_IDENTITY}\n\n${context}`,

        input: contents
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
      "Gemini request failed."
    );

    error.status = response.status;
    error.provider = "gemini";

    throw error;
  }

  const output =
    data?.output_text ||
    data?.steps
      ?.filter(step => step?.type === "model_output")
      ?.flatMap(step => Array.isArray(step?.content) ? step.content : [])
      ?.filter(item => item?.type === "text" && typeof item?.text === "string")
      ?.map(item => item.text)
      ?.join("") ||
    data?.steps
      ?.flatMap(step => Array.isArray(step?.content) ? step.content : [])
      ?.filter(item => typeof item?.text === "string")
      ?.map(item => item.text)
      ?.join("") ||
    "";

  if (!output) {
    throw new Error("Gemini returned an empty response.");
  }

  return output;
}

// --------------------------------------------------
// GROQ
// --------------------------------------------------

async function callGroq(message, history = [], context = "") {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Groq provider is not configured.");
  }

  const messages = [
    {
      role: "system",
      content: `${SHIVA_IDENTITY}\n\n${context}`
    },

    ...cleanHistory(history),

    {
      role: "user",
      content: message
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model: PROVIDERS.groq.model,
        messages
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
      "Groq request failed."
    );

    error.status = response.status;
    error.provider = "groq";

    throw error;
  }

  const output =
    data?.choices?.[0]?.message?.content || "";

  if (!output) {
    throw new Error("Groq returned an empty response.");
  }

  return output;
}

// --------------------------------------------------
// AI ROUTER
// --------------------------------------------------

async function routeToAI({
  provider,
  message,
  history,
  context
}) {
  if (!PROVIDERS[provider]) {
    throw new Error("Unsupported AI provider.");
  }

  if (provider === "gemini") {
    if (providerAvailable("gemini")) {
      try {
        return await callGemini(message, history, context);
      } catch (error) {
        const retryable =
          error.status === 408 ||
          error.status === 429 ||
          error.status === 500 ||
          error.status === 502 ||
          error.status === 503 ||
          error.status === 504 ||
          /high demand|temporar|overload|quota|rate.?limit|resource.?exhaust|unavailable|no longer available|new users/i.test(
            error.message || ""
          );

        if (!retryable) throw error;

        console.warn("Gemini unavailable; falling back to Groq.");
      }
    }

    if (providerAvailable("groq")) {
      return callGroq(message, history, context);
    }

    throw new Error(
      "Gemini is temporarily unavailable and no fallback provider is available."
    );
  }

  if (provider === "groq") {
    if (!providerAvailable("groq")) {
      throw new Error("Groq is currently unavailable.");
    }

    return callGroq(message, history, context);
  }

  throw new Error("Provider router error.");
}
// --------------------------------------------------
// AUTH ROUTES
// --------------------------------------------------

app.post("/api/auth/signup", (req, res) => {
  try {
    const {
      username,
      email,
      phone,
      password,
      display_name,
      device_name
    } = req.body || {};

    const usernameError = validateUsername(username);

    if (usernameError) {
      return res.status(400).json({
        success: false,
        error: usernameError
      });
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: passwordError
      });
    }

    const emailError = validateEmail(email);

    if (emailError) {
      return res.status(400).json({
        success: false,
        error: emailError
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        error: "Email or phone is required."
      });
    }

    const normalizedUsername =
      normalizeUsername(username);

    const normalizedEmail =
      email ? normalizeEmail(email) : null;

    const normalizedPhone =
      phone ? normalizePhone(phone) : null;

    const usernameExists = db.users.some(
      user =>
        normalizeUsername(user.username) ===
        normalizedUsername
    );

    if (usernameExists) {
      return res.status(409).json({
        success: false,
        error: "Username is already taken."
      });
    }

    if (
      normalizedEmail &&
      db.users.some(
        user =>
          user.email &&
          normalizeEmail(user.email) ===
          normalizedEmail
      )
    ) {
      return res.status(409).json({
        success: false,
        error: "Email is already registered."
      });
    }

    if (
      normalizedPhone &&
      db.users.some(
        user =>
          user.phone &&
          normalizePhone(user.phone) ===
          normalizedPhone
      )
    ) {
      return res.status(409).json({
        success: false,
        error: "Phone is already registered."
      });
    }

    const passwordData =
      hashPassword(password);

    const user = {
      user_id: makeId("usr"),

      username: String(username).trim(),

      email: normalizedEmail,

      phone: normalizedPhone,

      display_name:
        safeText(display_name, 60) ||
        String(username).trim(),

      avatar: null,

      role: "user",

      password_hash: passwordData.hash,
      password_salt: passwordData.salt,

      created_at: now(),
      updated_at: now()
    };

    db.users.push(user);

    const session =
      createSession(user.user_id, req);

    return res.status(201).json({
      success: true,
      user: publicUser(user),
      session: {
        token: session.token,
        session_id: session.session_id
      }
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      success: false,
      error: "Signup failed."
    });
  }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/auth/login", (req, res) => {
  try {
    const {
      identifier,
      password,
      device_name
    } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Identifier and password are required."
      });
    }

    const value =
      String(identifier).trim();

    const user = db.users.find(item => {
      const usernameMatch =
        normalizeUsername(item.username) ===
        normalizeUsername(value);

      const emailMatch =
        item.email &&
        normalizeEmail(item.email) ===
        normalizeEmail(value);

      const phoneMatch =
        item.phone &&
        normalizePhone(item.phone) ===
        normalizePhone(value);

      return (
        usernameMatch ||
        emailMatch ||
        phoneMatch
      );
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid login credentials."
      });
    }

    const valid =
      verifyPassword(
        password,
        user.password_hash,
        user.password_salt
      );

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Invalid login credentials."
      });
    }

    const session =
      createSession(user.user_id, {
        body: {
          device_name:
            device_name ||
            req.headers["user-agent"]
        },
        headers: req.headers
      });

    return res.json({
      success: true,

      user: publicUser(user),

      session: {
        token: session.token,
        session_id: session.session_id
      }
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      error: "Login failed."
    });
  }
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get("/api/auth/me", authenticate, (req, res) => {
  return res.json({
    success: true,

    user: publicUser(req.user),

    session: {
      session_id: req.session.session_id,
      created_at: req.session.created_at,
      last_seen: req.session.last_seen
    }
  });
});

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

app.post("/api/auth/logout", authenticate, (req, res) => {
  const sessionId =
    req.session.session_id;

  db.sessions =
    db.sessions.filter(
      item =>
        item.session_id !== sessionId
    );

  saveDatabase();

  return res.json({
    success: true,
    message: "Logged out successfully."
  });
});

// --------------------------------------------------
// ACCOUNT SESSIONS
// --------------------------------------------------

app.get(
  "/api/account/sessions",
  authenticate,
  (req, res) => {
    const sessions =
      db.sessions
        .filter(
          item =>
            item.user_id ===
            req.user.user_id
        )
        .map(item => ({
          ...publicSession(item),

          current:
            item.session_id ===
            req.session.session_id
        }));

    return res.json({
      success: true,
      sessions
    });
  }
);

// --------------------------------------------------
// REVOKE ONE SESSION
// --------------------------------------------------

app.delete(
  "/api/account/sessions/:id",
  authenticate,
  (req, res) => {
    const sessionId =
      req.params.id;

    const target =
      db.sessions.find(
        item =>
          item.session_id ===
            sessionId &&
          item.user_id ===
            req.user.user_id
      );

    if (!target) {
      return res.status(404).json({
        success: false,
        error: "Session not found."
      });
    }

    db.sessions =
      db.sessions.filter(
        item =>
          item.session_id !==
          sessionId
      );

    saveDatabase();

    return res.json({
      success: true,
      message: "Session revoked."
    });
  }
);

// --------------------------------------------------
// LOGOUT ALL OTHER DEVICES
// --------------------------------------------------

app.post(
  "/api/account/sessions/logout-others",
  authenticate,
  (req, res) => {
    const currentId =
      req.session.session_id;

    db.sessions =
      db.sessions.filter(
        item =>
          item.user_id !==
            req.user.user_id ||
          item.session_id ===
            currentId
      );

    saveDatabase();

    return res.json({
      success: true,
      message:
        "Other sessions logged out."
    });
  }
);

// --------------------------------------------------
// ACCOUNT PROFILE
// --------------------------------------------------

app.put(
  "/api/account/profile",
  authenticate,
  (req, res) => {
    const {
      display_name,
      avatar
    } = req.body || {};

    if (display_name !== undefined) {
      req.user.display_name =
        safeText(display_name, 60) ||
        req.user.username;
    }

    if (avatar !== undefined) {
      req.user.avatar =
        safeText(avatar, 500);
    }

    req.user.updated_at = now();

    saveDatabase();

    return res.json({
      success: true,
      user: publicUser(req.user)
    });
  }
);

// --------------------------------------------------
// CHANGE PASSWORD
// --------------------------------------------------

app.post(
  "/api/account/change-password",
  authenticate,
  (req, res) => {
    const {
      current_password,
      new_password
    } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error:
          "Current and new password are required."
      });
    }

    const valid =
      verifyPassword(
        current_password,
        req.user.password_hash,
        req.user.password_salt
      );

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect."
      });
    }

    const passwordError =
      validatePassword(new_password);

    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: passwordError
      });
    }

    const passwordData =
      hashPassword(new_password);

    req.user.password_hash =
      passwordData.hash;

    req.user.password_salt =
      passwordData.salt;

    req.user.updated_at = now();

    // Security action:
    // revoke all sessions except
    // the session currently being used.
    const currentSessionId =
      req.session.session_id;

    db.sessions =
      db.sessions.filter(
        item =>
          item.user_id !==
            req.user.user_id ||
          item.session_id ===
            currentSessionId
      );

    saveDatabase();

    return res.json({
      success: true,
      message:
        "Password changed successfully."
    });
  }
);

// --------------------------------------------------
// ACCOUNT RECOVERY
// --------------------------------------------------

const RECOVERY_OTP_TTL_MS = 10 * 60 * 1000;
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_APPROVAL_TTL_MS = 5 * 60 * 1000;

function generateRecoveryOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashRecoveryValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function findRecoveryUser(identifier) {
  const value = String(identifier || "").trim();

  return db.users.find(item =>
    normalizeUsername(item.username) === normalizeUsername(value) ||
    (item.email && normalizeEmail(item.email) === normalizeEmail(value)) ||
    (item.phone && normalizePhone(item.phone) === normalizePhone(value))
  );
}

function recoveryMethodsForUser(user) {
  const methods = [];

  if (user.email) {
    methods.push({
      id: "email",
      type: "otp",
      label: "Email OTP",
      available: true
    });
  }

  if (user.phone) {
    methods.push({
      id: "sms",
      type: "otp",
      label: "SMS OTP",
      available: true
    });

    methods.push({
      id: "whatsapp",
      type: "otp",
      label: "WhatsApp OTP",
      available: true
    });

    methods.push({
      id: "call",
      type: "otp",
      label: "Voice Call OTP",
      available: true
    });
  }

  if (user.instagram_id) {
    methods.push({
      id: "instagram",
      type: "approval",
      label: "Instagram Approval",
      available: true
    });
  }

  return methods;
}

// Start recovery.
app.post("/api/auth/recovery/start", (req, res) => {
  const { identifier } = req.body || {};

  if (!identifier) {
    return res.status(400).json({
      success: false,
      error: "Identifier is required."
    });
  }

  const user = findRecoveryUser(identifier);

  if (!user) {
    return res.json({
      success: true,
      message: "If the account exists, recovery options are available.",
      methods: []
    });
  }

  const methods = recoveryMethodsForUser(user);

  return res.json({
    success: true,
    message: "Recovery options available.",
    methods
  });
});

// Request OTP or approval.
app.post("/api/auth/recovery/request", (req, res) => {
  const {
    identifier,
    method
  } = req.body || {};

  if (!identifier || !method) {
    return res.status(400).json({
      success: false,
      error: "Identifier and recovery method are required."
    });
  }

  const user = findRecoveryUser(identifier);

  if (!user) {
    return res.json({
      success: true,
      message: "If the account exists, the verification request has been created."
    });
  }

  const allowed = ["email", "sms", "whatsapp", "call", "instagram"];

  if (!allowed.includes(method)) {
    return res.status(400).json({
      success: false,
      error: "Unsupported recovery method."
    });
  }

  const recoveryId = makeId("recovery");

  if (!db.recoveryRequests) {
    db.recoveryRequests = [];
  }

  const request = {
    recovery_id: recoveryId,
    user_id: user.user_id,
    method,
    type: method === "instagram" ? "approval" : "otp",
    otp_hash: null,
    attempts: 0,
    verified: false,
    approved: false,
    used: false,
    created_at: now(),
    expires_at: new Date(
      Date.now() +
      (
        method === "instagram"
          ? RECOVERY_APPROVAL_TTL_MS
          : RECOVERY_OTP_TTL_MS
      )
    ).toISOString()
  };

  if (request.type === "otp") {
    const otp = generateRecoveryOtp();

    request.otp_hash = hashRecoveryValue(otp);

    // Development-only visibility.
    // Real email/SMS/WhatsApp/call providers must deliver this OTP.
    request.development_otp =
      process.env.NODE_ENV !== "production"
        ? otp
        : undefined;
  }

  db.recoveryRequests.push(request);
  saveDatabase();

  return res.json({
    success: true,
    recovery_id: recoveryId,
    method,
    type: request.type,

    development_only:
      process.env.NODE_ENV !== "production" &&
      request.type === "otp"
        ? {
            otp: request.development_otp
          }
        : undefined,

    message:
      request.type === "approval"
        ? "Approval request created."
        : "Verification code sent."
  });
});

// Verify OTP.
app.post("/api/auth/recovery/verify", (req, res) => {
  const {
    recovery_id,
    otp
  } = req.body || {};

  if (!recovery_id || !otp) {
    return res.status(400).json({
      success: false,
      error: "Recovery ID and OTP are required."
    });
  }

  if (!db.recoveryRequests) {
    return res.status(400).json({
      success: false,
      error: "Invalid recovery request."
    });
  }

  const request = db.recoveryRequests.find(
    item =>
      item.recovery_id === recovery_id &&
      item.used === false
  );

  if (!request) {
    return res.status(400).json({
      success: false,
      error: "Invalid recovery request."
    });
  }

  if (
    Date.now() >
    new Date(request.expires_at).getTime()
  ) {
    return res.status(400).json({
      success: false,
      error: "Verification request expired."
    });
  }

  if (request.attempts >= RECOVERY_MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      error: "Too many verification attempts."
    });
  }

  request.attempts += 1;

  const valid =
    hashRecoveryValue(otp) ===
    request.otp_hash;

  if (!valid) {
    saveDatabase();

    return res.status(400).json({
      success: false,
      error: "Invalid verification code."
    });
  }

  request.verified = true;
  request.verified_at = now();

  saveDatabase();

  return res.json({
    success: true,
    verified: true,
    recovery_id
  });
});

// Direct approval completion.
// A trusted external provider/webhook can mark the request approved.
app.post("/api/auth/recovery/approve", (req, res) => {
  const {
    recovery_id
  } = req.body || {};

  if (!recovery_id || !db.recoveryRequests) {
    return res.status(400).json({
      success: false,
      error: "Invalid recovery request."
    });
  }

  const request = db.recoveryRequests.find(
    item =>
      item.recovery_id === recovery_id &&
      item.used === false &&
      item.type === "approval"
  );

  if (!request) {
    return res.status(400).json({
      success: false,
      error: "Invalid approval request."
    });
  }

  if (
    Date.now() >
    new Date(request.expires_at).getTime()
  ) {
    return res.status(400).json({
      success: false,
      error: "Approval request expired."
    });
  }

  request.approved = true;
  request.approved_at = now();

  saveDatabase();

  return res.json({
    success: true,
    approved: true,
    recovery_id
  });
});

// Set new password after successful verification.
app.post("/api/auth/recovery/reset-password", (req, res) => {
  const {
    recovery_id,
    new_password
  } = req.body || {};

  if (!recovery_id || !new_password) {
    return res.status(400).json({
      success: false,
      error: "Recovery ID and new password are required."
    });
  }

  if (!db.recoveryRequests) {
    return res.status(400).json({
      success: false,
      error: "Invalid recovery request."
    });
  }

  const request = db.recoveryRequests.find(
    item =>
      item.recovery_id === recovery_id &&
      item.used === false
  );

  if (!request) {
    return res.status(400).json({
      success: false,
      error: "Invalid recovery request."
    });
  }

  if (!request.verified && !request.approved) {
    return res.status(403).json({
      success: false,
      error: "Recovery verification is required first."
    });
  }

  const passwordError =
    validatePassword(new_password);

  if (passwordError) {
    return res.status(400).json({
      success: false,
      error: passwordError
    });
  }

  const user = db.users.find(
    item =>
      item.user_id === request.user_id
  );

  if (!user) {
    return res.status(400).json({
      success: false,
      error: "Account not found."
    });
  }

  const passwordData =
    hashPassword(new_password);

  user.password_hash =
    passwordData.hash;

  user.password_salt =
    passwordData.salt;

  user.updated_at = now();

  request.used = true;
  request.completed_at = now();

  // Password recovery invalidates all existing sessions.
  db.sessions =
    db.sessions.filter(
      item =>
        item.user_id !== user.user_id
    );

  saveDatabase();

  return res.json({
    success: true,
    message:
      "Password changed successfully. Please log in again."
  });
});

// Legacy compatibility endpoint.
app.post("/api/auth/forgot-password", (req, res) => {
  const { identifier } = req.body || {};

  if (!identifier) {
    return res.status(400).json({
      success: false,
      error: "Identifier is required."
    });
  }

  const user = findRecoveryUser(identifier);

  if (!user) {
    return res.json({
      success: true,
      message:
        "If the account exists, recovery instructions will be generated."
    });
  }

  return res.json({
    success: true,
    message:
      "Recovery is available. Use /api/auth/recovery/start."
  });
});

// Legacy compatibility endpoint.
app.post("/api/auth/reset-password", (req, res) => {
  return res.status(410).json({
    success: false,
    error:
      "Legacy password reset endpoint retired. Use the recovery flow."
  });
});

// --------------------------------------------------
// CHATS
// --------------------------------------------------

app.get(
  "/api/chats",
  authenticate,
  (req, res) => {
    const mode =
      req.query.mode;

    const provider =
      req.query.provider;

    let chats =
      db.chats.filter(
        chat =>
          chat.user_id ===
          req.user.user_id
      );

    if (mode) {
      chats =
        chats.filter(
          chat =>
            chat.mode === mode
        );
    }

    if (provider) {
      chats =
        chats.filter(
          chat =>
            chat.provider ===
            provider
        );
    }

    chats.sort(
      (a, b) =>
        new Date(b.updated_at) -
        new Date(a.updated_at)
    );

    return res.json({
      success: true,
      chats
    });
  }
);

// --------------------------------------------------
// CREATE CHAT
// --------------------------------------------------

app.post(
  "/api/chats",
  authenticate,
  (req, res) => {
    const {
      mode = "unified",
      provider = "gemini",
      title = "New Chat",
      messages = [],
      incognito = false
    } = req.body || {};

    // Incognito chats must never
    // enter normal persistent storage.
    if (incognito) {
      return res.status(400).json({
        success: false,
        error:
          "Incognito chats are not persisted."
      });
    }

    if (
      mode !== "unified" &&
      mode !== "split"
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid chat mode."
      });
    }

    if (!PROVIDERS[provider]) {
      return res.status(400).json({
        success: false,
        error: "Invalid provider."
      });
    }

    const chat = {
      chat_id: makeId("chat"),

      user_id:
        req.user.user_id,

      mode,

      provider,

      title:
        safeText(title, 120) ||
        "New Chat",

      messages:
        Array.isArray(messages)
          ? messages.slice(-100)
          : [],

      created_at: now(),
      updated_at: now()
    };

    db.chats.push(chat);

    saveDatabase();

    return res.status(201).json({
      success: true,
      chat
    });
  }
);

// --------------------------------------------------
// UPDATE CHAT
// --------------------------------------------------

app.put(
  "/api/chats/:id",
  authenticate,
  (req, res) => {
    const chat =
      db.chats.find(
        item =>
          item.chat_id ===
            req.params.id &&
          item.user_id ===
            req.user.user_id
      );

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: "Chat not found."
      });
    }

    const {
      title,
      mode,
      provider,
      messages
    } = req.body || {};

    if (title !== undefined) {
      chat.title =
        safeText(title, 120);
    }

    if (
      mode === "unified" ||
      mode === "split"
    ) {
      chat.mode = mode;
    }

    if (provider !== undefined) {
      if (!PROVIDERS[provider]) {
        return res.status(400).json({
          success: false,
          error: "Invalid provider."
        });
      }

      chat.provider = provider;
    }

    if (Array.isArray(messages)) {
      chat.messages =
        messages.slice(-100);
    }

    chat.updated_at = now();

    saveDatabase();

    return res.json({
      success: true,
      chat
    });
  }
);

// --------------------------------------------------
// DELETE CHAT
// --------------------------------------------------

app.delete(
  "/api/chats/:id",
  authenticate,
  (req, res) => {
    const before =
      db.chats.length;

    db.chats =
      db.chats.filter(
        chat =>
          !(
            chat.chat_id ===
              req.params.id &&
            chat.user_id ===
              req.user.user_id
          )
      );

    if (before === db.chats.length) {
      return res.status(404).json({
        success: false,
        error: "Chat not found."
      });
    }

    saveDatabase();

    return res.json({
      success: true,
      message: "Chat deleted."
    });
  }
);

// --------------------------------------------------
// SHIVA MEMORY
// --------------------------------------------------

app.get(
  "/api/memory",
  authenticate,
  (req, res) => {
    const memories =
      db.memories.filter(
        item =>
          item.user_id ===
          req.user.user_id
      );

    return res.json({
      success: true,
      memories
    });
  }
);

app.post(
  "/api/memory",
  authenticate,
  (req, res) => {
    const {
      content,
      category = "general"
    } = req.body || {};

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "Memory content is required."
      });
    }

    const memory = {
      memory_id: makeId("mem"),

      user_id:
        req.user.user_id,

      category:
        safeText(category, 50),

      content:
        safeText(content, 5000),

      created_at: now(),
      updated_at: now()
    };

    db.memories.push(memory);

    saveDatabase();

    return res.status(201).json({
      success: true,
      memory
    });
  }
);

app.delete(
  "/api/memory/:id",
  authenticate,
  (req, res) => {
    const before =
      db.memories.length;

    db.memories =
      db.memories.filter(
        item =>
          !(
            item.memory_id ===
              req.params.id &&
            item.user_id ===
              req.user.user_id
          )
      );

    if (before === db.memories.length) {
      return res.status(404).json({
        success: false,
        error: "Memory not found."
      });
    }

    saveDatabase();

    return res.json({
      success: true,
      message: "Memory deleted."
    });
  }
);

// --------------------------------------------------
// PROJECTS
// --------------------------------------------------

app.get(
  "/api/projects",
  authenticate,
  (req, res) => {
    const projects =
      db.projects.filter(
        project =>
          project.user_id ===
          req.user.user_id
      );

    return res.json({
      success: true,
      projects
    });
  }
);

app.post(
  "/api/projects",
  authenticate,
  (req, res) => {
    const {
      name,
      description = ""
    } = req.body || {};

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Project name is required."
      });
    }

    const project = {
      project_id: makeId("proj"),

      user_id:
        req.user.user_id,

      name:
        safeText(name, 120),

      description:
        safeText(description, 1000),

      chats: [],
      files: [],
      notes: [],
      memory: [],
      progress: [],

      created_at: now(),
      updated_at: now()
    };

    db.projects.push(project);

    saveDatabase();

    return res.status(201).json({
      success: true,
      project
    });
  }
);

app.put(
  "/api/projects/:id",
  authenticate,
  (req, res) => {
    const project =
      db.projects.find(
        item =>
          item.project_id ===
            req.params.id &&
          item.user_id ===
            req.user.user_id
      );

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "Project not found."
      });
    }

    const {
      name,
      description,
      chats,
      files,
      notes,
      memory,
      progress
    } = req.body || {};

    if (name !== undefined) {
      project.name =
        safeText(name, 120);
    }

    if (description !== undefined) {
      project.description =
        safeText(description, 1000);
    }

    if (Array.isArray(chats)) {
      project.chats = chats;
    }

    if (Array.isArray(files)) {
      project.files = files;
    }

    if (Array.isArray(notes)) {
      project.notes = notes;
    }

    if (Array.isArray(memory)) {
      project.memory = memory;
    }

    if (Array.isArray(progress)) {
      project.progress = progress;
    }

    project.updated_at = now();

    saveDatabase();

    return res.json({
      success: true,
      project
    });
  }
);

app.delete(
  "/api/projects/:id",
  authenticate,
  (req, res) => {
    const before =
      db.projects.length;

    db.projects =
      db.projects.filter(
        project =>
          !(
            project.project_id ===
              req.params.id &&
            project.user_id ===
              req.user.user_id
          )
      );

    if (before === db.projects.length) {
      return res.status(404).json({
        success: false,
        error: "Project not found."
      });
    }

    saveDatabase();

    return res.json({
      success: true,
      message: "Project deleted."
    });
  }
);

// --------------------------------------------------
// AI MESSAGE
// --------------------------------------------------

app.post(
  "/api/message",
  async (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : req.headers["x-session-token"];

    if (!token) {
      req.user = { user_id: "guest", username: "guest" };
      req.session = null;

      if (req.body && typeof req.body === "object") {
        req.body.memory = [];
        req.body.project_context = "";
      }

      return next();
    }

    return authenticate(req, res, next);
  },
  async (req, res) => {
    try {
      const {
        mode = "unified",
        provider = "gemini",
        message,
        history = [],
        memory = [],
        project_context = "",
        incognito = false
      } = req.body || {};

      if (!message) {
        return res.status(400).json({
          success: false,
          error: "Message is required."
        });
      }

      if (!PROVIDERS[provider]) {
        return res.status(400).json({
          success: false,
          error: "Invalid provider."
        });
      }

      /*
        Incognito requests are processed normally,
        but their long-term memory/project context
        is not automatically included.
      */

      const safeMemory =
        incognito
          ? []
          : Array.isArray(memory)
            ? memory.slice(-30)
            : [];

      const memoryContext =
        safeMemory.length
          ? `Authorized Shiva Memory:\n${safeMemory
              .map(item =>
                typeof item === "string"
                  ? item
                  : item.content || ""
              )
              .filter(Boolean)
              .join("\n")}`
          : "";

      const context = [
        `Authenticated user_id: ${req.user.user_id}`,

        `Username: ${req.user.username}`,

        `AI mode: ${mode}`,

        `Selected underlying provider: ${provider}`,

        incognito
          ? "Current conversation is Incognito. Do not save or infer long-term memory from this conversation."
          : "",

        memoryContext,

        incognito
          ? ""
          : safeText(project_context, 12000)
      ]
        .filter(Boolean)
        .join("\n\n");

      const answer =
        await routeToAI({
          provider,
          message:
            safeText(message, 12000),
          history,
          context
        });

      return res.json({
        success: true,

        provider,

        mode,

        message: answer,

        user_id:
          req.user.user_id
      });
    } catch (error) {
      console.error(
        "AI route error:",
        error
      );

      const status =
        error.status === 429
          ? 429
          : error.status >= 400 &&
            error.status < 600
            ? error.status
            : 500;

      return res.status(status).json({
        success: false,

        provider:
          error.provider || null,

        error:
          error.message ||
          "AI request failed."
      });
    }
  }
);


// --------------------------------------------------
// SHIVA AUTONOMOUS AGENT BRIDGE
// --------------------------------------------------

const AGENT_COOLDOWN = new Map();

function agentCooldown(provider) {
  const until = AGENT_COOLDOWN.get(provider) || 0;
  if (until <= Date.now()) {
    AGENT_COOLDOWN.delete(provider);
    return 0;
  }
  return until - Date.now();
}

function setAgentCooldown(provider, ms) {
  AGENT_COOLDOWN.set(provider, Date.now() + ms);
}

function agentTools(tools) {
  if (!Array.isArray(tools)) return [];

  return tools
    .filter(t => t && typeof t.name === "string")
    .map(t => ({
      type: "function",
      name: t.name,
      description: String(t.description || ""),
      parameters: t.parameters || {
        type: "object",
        properties: {}
      }
    }));
}

async function callGeminiAgent(reqData) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini provider is not configured.");

  const context = reqData.context || "";

  const body = {
    model: PROVIDERS.gemini.model,
    system_instruction: {
      parts: [{
        text:
          SHIVA_IDENTITY +
          "\n\n" +
          context +
          "\n\nYou are the Shiva 2.0 autonomous coding agent. Inspect before editing. Use tools when required. Test after changes."
      }]
    },
    input: reqData.previous_interaction_id
      ? (reqData.tool_results || []).map(r => ({
          type: "function_result",
          name: r.name,
          call_id: r.call_id,
          result: [{
            type: "text",
            text: JSON.stringify(r.result)
          }]
        }))
      : String(reqData.message || ""),
    tools: agentTools(reqData.tools)
  };

  if (reqData.previous_interaction_id) {
    body.previous_interaction_id = reqData.previous_interaction_id;
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Gemini agent request failed."
    );
    e.status = response.status;
    e.provider = "gemini";
    throw e;
  }

  const function_calls = (data.steps || [])
    .filter(x => x?.type === "function_call")
    .map(x => ({
      id: x.id,
      call_id: x.id,
      name: x.name,
      arguments: x.arguments || {}
    }));

  const output = (data.steps || [])
    .filter(x => x?.type === "model_output")
    .flatMap(x => x.content || [])
    .map(x => x.text || "")
    .join("");

  return {
    provider: "gemini",
    interaction_id: data.id || null,
    function_calls,
    output
  };
}

async function callGroqAgent(reqData) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq provider is not configured.");

  const messages = [
    {
      role: "system",
      content:
        SHIVA_IDENTITY +
        "\n\n" +
        (reqData.context || "") +
        "\n\nYou are the Shiva 2.0 autonomous coding agent. Use tools when required."
    },
    ...(Array.isArray(reqData.history) ? reqData.history : []),
    {
      role: "user",
      content: String(reqData.message || "")
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: PROVIDERS.groq.model,
        messages,
        tools: agentTools(reqData.tools),
        tool_choice: "auto"
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Groq agent request failed."
    );
    e.status = response.status;
    e.provider = "groq";
    throw e;
  }

  const msg = data?.choices?.[0]?.message || {};

  const function_calls = (msg.tool_calls || []).map(call => {
    let args = {};

    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {}

    return {
      id: call.id,
      call_id: call.id,
      name: call.function?.name,
      arguments: args
    };
  });

  return {
    provider: "groq",
    interaction_id: null,
    function_calls,
    output: msg.content || ""
  };
}

async function callLunaAgent(reqData) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Luna provider is not configured.");

  const text =
    SHIVA_IDENTITY +
    "\n\n" +
    (reqData.context || "") +
    "\n\nYou are the Shiva 2.0 autonomous coding agent. Use tools when required.\n\n" +
    String(reqData.message || "");

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: PROVIDERS.luna.model,
        input: text,
        tools: agentTools(reqData.tools),
        max_output_tokens: 1200
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Luna agent request failed."
    );
    e.status = response.status;
    e.provider = "luna";
    throw e;
  }

  const function_calls = (data.output || [])
    .filter(x => x?.type === "function_call")
    .map(x => {
      let args = {};

      try {
        args = JSON.parse(x.arguments || "{}");
      } catch {}

      return {
        id: x.id,
        call_id: x.call_id,
        name: x.name,
        arguments: args
      };
    });

  return {
    provider: "luna",
    interaction_id: data.id || null,
    function_calls,
    output: data.output_text || ""
  };
}

app.post("/api/agent", authenticate, async (req, res) => {
  const body = req.body || {};
  const requested = body.provider || "gemini";

  const order = [
    requested,
    "gemini",
    "groq",
    "luna"
  ].filter(
    (p, i, a) => PROVIDERS[p] && a.indexOf(p) === i
  );

  const failures = [];

  for (const provider of order) {
    if (!providerAvailable(provider)) continue;
    if (agentCooldown(provider)) continue;

    try {
      let result;

      if (provider === "gemini") {
        result = await callGeminiAgent(body);
      } else if (provider === "groq") {
        result = await callGroqAgent(body);
      } else {
        result = await callLunaAgent(body);
      }

      return res.json({
        success: true,
        ...result,
        failures
      });
    } catch (error) {
      failures.push({
        provider,
        status: error.status || null,
        error: error.message || "Provider failed."
      });

      if (error.status === 429) {
        setAgentCooldown(
          provider,
          String(error.message || "").toLowerCase().includes("credit")
            ? 86400000
            : 60000
        );
      }

      console.error(
        "Agent provider failed:",
        provider,
        error.message
      );
    }
  }

  return res.status(503).json({
    success: false,
    error: "All configured AI providers are currently unavailable.",
    failures
  });
});

// --------------------------------------------------
// BACKEND STATUS
// --------------------------------------------------

app.get(
  "/api/status",
  (req, res) => {
    return res.json({
      success: true,

      message:
        "Shiva 2.0 Backend + AI Router is working! 🚀",

      providers: {
        gemini:
          providerAvailable("gemini"),

        groq:
          providerAvailable("groq")
      },

      features: {
        auth: true,

        multiAccount: true,

        persistentSessions: true,

        persistentChats: true,

        memory: true,

        projects: true,

        incognitoIsolation: true
      },

      note:
        "Provider availability and provider-side limits remain authoritative."
    });
  }
);

// --------------------------------------------------
// BACKEND DATA TEST
// --------------------------------------------------

app.post(
  "/api/backend-test",
  (req, res) => {
    return res.json({
      success: true,

      message:
        "Backend received the data successfully.",

      received:
        req.body || {},

      timestamp: now()
    });
  }
);

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get(
  "/",
  (req, res) => {
    return res.json({
      success: true,
      message:
        "Shiva 2.0 backend is online."
    });
  }
);

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      error: "API route not found."
    });
  }
);

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Internal server error."
    });
  }
);

// --------------------------------------------------
// START
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Shiva 2.0 backend running on port ${PORT}`
    );
  }
);