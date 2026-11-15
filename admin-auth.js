
const crypto = require("crypto");

const COOKIE_NAME = "logvidia_admin_session";
const SESSION_HOURS = 8;

function sign(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return first.length === second.length &&
    crypto.timingSafeEqual(first, second);
}

function createToken(secret) {
  const payload = {
    admin: true,
    exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

function verifyToken(token, secret) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return false;

    const [data, signature] = parts;
    if (!safeEqual(signature, sign(data, secret))) return false;

    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    );

    return payload.admin === true &&
      Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");

  for (const item of cookies) {
    const index = item.indexOf("=");
    if (index < 0) continue;

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    if (key === name) return decodeURIComponent(value);
  }

  return "";
}

function setCookie(res, value, maxAge) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  );
}

function clearCookie(res) {
  setCookie(res, "", 0);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminPassword || !sessionSecret || sessionSecret.length < 32) {
    return res.status(503).json({
      ok: false,
      message: "Admin authentication is not configured."
    });
  }

  const action = req.method === "GET" ? "check" : req.body?.action;

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  if (req.method === "POST") {
    const origin = req.headers.origin;
    const host = req.headers["x-forwarded-host"] || req.headers.host;

    if (origin) {
      try {
        if (new URL(origin).host !== host) {
          return res.status(403).json({ ok: false });
        }
      } catch {
        return res.status(403).json({ ok: false });
      }
    }
  }

  if (action === "check") {
    const token = getCookie(req, COOKIE_NAME);
    const authenticated = verifyToken(token, sessionSecret);

    return res.status(200).json({
      ok: true,
      authenticated
    });
  }

  if (action === "logout") {
    clearCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === "login") {
    const password = req.body?.password;

    if (
      typeof password !== "string" ||
      password.length > 200 ||
      !safeEqual(password, adminPassword)
    ) {
      return res.status(401).json({
        ok: false,
        message: "بيانات الدخول غير صحيحة."
      });
    }

    const token = createToken(sessionSecret);

    setCookie(res, token, SESSION_HOURS * 60 * 60);

    return res.status(200).json({
      ok: true,
      authenticated: true
    });
  }

  return res.status(400).json({
    ok: false,
    message: "Invalid action."
  });
};
