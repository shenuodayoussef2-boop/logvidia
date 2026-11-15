
const crypto = require("crypto");

const COOKIE_NAME = "logvidia_admin_session";

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

function getCookie(req, name) {
  try {
    const cookies = String(req.headers.cookie || "").split(";");

    for (const item of cookies) {
      const index = item.indexOf("=");
      if (index < 0) continue;

      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();

      if (key === name) {
        return decodeURIComponent(value);
      }
    }
  } catch {
    return "";
  }

  return "";
}

function verifyToken(token, secret) {
  try {
    if (!token || token.length > 2000) return false;

    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [data, signature] = parts;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("base64url");

    if (!safeEqual(signature, expected)) return false;

    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    );

    return (
      payload.admin === true &&
      Number.isFinite(payload.exp) &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function requireAdmin(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    res.status(503).json({
      ok: false,
      message: "Admin authentication is not configured."
    });

    return false;
  }

  const token = getCookie(req, COOKIE_NAME);

  if (!verifyToken(token, secret)) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized."
    });

    return false;
  }

  return true;
}

module.exports = {
  requireAdmin
};
