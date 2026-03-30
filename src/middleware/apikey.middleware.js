const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];

  if (!key) {
    return res.status(401).json({ error: "Missing API key" });
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
  });

  if (!apiKey || !apiKey.active) {
    return res.status(403).json({ error: "Invalid or inactive API key" });
  }

  req.apiKey = apiKey;
  next();
}

module.exports = { requireApiKey };
