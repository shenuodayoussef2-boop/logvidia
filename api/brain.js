
const { getProducts } = require("./_lib");

// Normalize Arabic and English text for better understanding
function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detect the user's intended task
function detectIntent(message = "") {
  const text = normalizeText(message);

  if (/فاتوره|فواتير|invoice|invoices/.test(text)) {
    return "invoices";
  }

  if (/مبيعات|ارباح|تقرير|احصائيات|sales|revenue|report/.test(text)) {
    return "reports";
  }

  if (/طلب|طلبات|order|orders|شحن|توصيل/.test(text)) {
    return "orders";
  }

  if (/مخزون|كميه|نفذ|ناقص|stock|inventory/.test(text)) {
    return "inventory";
  }

  if (/اضف منتج|اضافه منتج|عدل منتج|احذف منتج/.test(text)) {
    return "manage_products";
  }

  if (/منتج|منتجات|سعر|اسعار|متاح|available|product/.test(text)) {
    return "products";
  }

  return "general";
}

// Load verified store knowledge
async function getStoreKnowledge() {
  try {
    const products = await getProducts();

    return {
      products: products || [],
      totalProducts: products?.length || 0,
      source: "supabase"
    };
  } catch (error) {
    console.error("Brain knowledge error:", error.message);

    return {
      products: [],
      totalProducts: 0,
      source: "unavailable"
    };
  }
}

// Build the AI brain context
async function think({ message, history = [], role = "customer" }) {
  const intent = detectIntent(message);
  const knowledge = await getStoreKnowledge();

  const allowedRole =
    role === "owner" ? "owner" : "customer";

  const ownerOnlyIntents = [
    "invoices",
    "reports",
    "orders",
    "inventory",
    "manage_products"
  ];

  if (
    allowedRole !== "owner" &&
    ownerOnlyIntents.includes(intent)
  ) {
    return {
      success: true,
      intent,
      role: allowedRole,
      requiresAuthorization: true,
      context: null,
      message: "هذه المعلومات متاحة لصاحب المتجر فقط."
    };
  }

  return {
    success: true,
    intent,
    role: allowedRole,
    requiresAuthorization: false,
    context: {
      storeKnowledge: knowledge,
      conversationHistory: history.slice(-12),
      currentMessage: message
    }
  };
}

module.exports = {
  normalizeText,
  detectIntent,
  getStoreKnowledge,
  think
};
