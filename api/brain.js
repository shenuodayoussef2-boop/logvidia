
const { getProducts } = require("./_lib");

// ==========================================
// 1. TEXT UNDERSTANDING
// ==========================================

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

const STOP_WORDS = new Set([
  "من", "في", "على", "عن", "الى", "مع", "ده", "دي",
  "دا", "هو", "هي", "انا", "انت", "عايز", "عاوزه",
  "ممكن", "لو", "سمحت", "بعد", "قبل", "ايه", "اي",
  "كام", "ازاي", "هل", "طيب", "طب", "بكام", "ليه",
  "the", "is", "are", "a", "an", "of", "for", "to",
  "and", "with", "how", "much", "what", "please"
]);

function extractKeywords(message = "") {
  return normalizeText(message)
    .split(" ")
    .filter(word => word.length > 1 && !STOP_WORDS.has(word))
    .slice(0, 20);
}

// ==========================================
// 2. INTENT UNDERSTANDING
// ==========================================

const INTENT_PATTERNS = [
  {
    intent: "invoices",
    patterns: [
      /فاتور/,
      /فواتير/,
      /invoice/,
      /invoices/
    ]
  },
  {
    intent: "reports",
    patterns: [
      /مبيعات/,
      /ارباح/,
      /تقرير/,
      /احصائيات/,
      /sales/,
      /revenue/,
      /report/
    ]
  },
  {
    intent: "orders",
    patterns: [
      /طلبات/,
      /طلباتي/,
      /طلب رقم/,
      /order/,
      /orders/,
      /شحن/,
      /توصيل/,
      /تتبع/
    ]
  },
  {
    intent: "inventory",
    patterns: [
      /مخزون/,
      /كميه/,
      /نفذ/,
      /ناقص/,
      /stock/,
      /inventory/
    ]
  },
  {
    intent: "manage_products",
    patterns: [
      /اضف منتج/,
      /اضافه منتج/,
      /عدل منتج/,
      /تعديل منتج/,
      /احذف منتج/,
      /حذف منتج/
    ]
  },
  {
    intent: "products",
    patterns: [
      /منتج/,
      /منتجات/,
      /سعر/,
      /اسعار/,
      /بكام/,
      /خصم/,
      /متاح/,
      /متوفر/,
      /product/,
      /products/,
      /price/,
      /discount/
    ]
  }
];

function detectIntent(message = "") {
  const text = normalizeText(message);

  for (const group of INTENT_PATTERNS) {
    if (group.patterns.some(pattern => pattern.test(text))) {
      return group.intent;
    }
  }

  return "general";
}

// ==========================================
// 3. UNDERSTAND THE SPECIFIC REQUEST
// ==========================================

function detectTask(message = "", intent = "general") {
  const text = normalizeText(message);

  if (
    /خصم|تخفيض|عروض|discount|sale/.test(text)
  ) {
    return "find_discounts";
  }

  if (
    /قارن|مقارنه|الفرق|افضل من|compare|comparison/.test(text)
  ) {
    return "compare_products";
  }

  if (
    /سعر|اسعار|بكام|كام|price|cost/.test(text)
  ) {
    return "check_price";
  }

  if (
    /متاح|متوفر|موجود|availability|available/.test(text)
  ) {
    return "check_availability";
  }

  if (intent === "products") {
    return "search_products";
  }

  if (intent === "orders") {
    return "order_inquiry";
  }

  if (intent === "reports") {
    return "sales_report";
  }

  if (intent === "inventory") {
    return "inventory_inquiry";
  }

  if (intent === "invoices") {
    return "invoice_inquiry";
  }

  if (intent === "manage_products") {
    return "manage_catalog";
  }

  return "general_question";
}

// ==========================================
// 4. CONVERSATION CONTEXT
// ==========================================

function cleanHistory(history = []) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .map(item => {
      if (!item || typeof item !== "object") return null;

      const role = ["user", "assistant"].includes(item.role)
        ? item.role
        : null;

      const content =
        item.content ||
        item.message ||
        item.question ||
        item.answer ||
        "";

      if (!role || typeof content !== "string") return null;

      return {
        role,
        content: content.slice(0, 3000)
      };
    })
    .filter(Boolean);
}

function getPreviousUserMessage(history = []) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      return history[i].content;
    }
  }

  return "";
}

function isFollowUp(message = "", history = []) {
  if (!history.length) return false;

  const text = normalizeText(message);

  const followUpPatterns = [
    /^(طيب|طب|تمام|اوكي|اه|لا|وكمان|كمان)/,
    /^(والتاني|والتانيه|وده|ودي|ده|دي)/,
    /^(سعره|سعرها|خصمه|خصمها|مقاسه|مقاسها)/,
    /^(more|and|what about|how about|its price)/
  ];

  if (followUpPatterns.some(pattern => pattern.test(text))) {
    return true;
  }

  const words = text.split(" ").filter(Boolean);

  return words.length <= 4 && Boolean(
    getPreviousUserMessage(history)
  );
}

// ==========================================
// 5. STORE KNOWLEDGE
// ==========================================

async function getStoreKnowledge() {
  try {
    const products = await getProducts();

    return {
      products: products || [],
      totalProducts: products?.length || 0,
      source: "supabase",
      available: true
    };
  } catch (error) {
    console.error("Brain knowledge error:", error.message);

    return {
      products: [],
      totalProducts: 0,
      source: "unavailable",
      available: false
    };
  }
}

// ==========================================
// 6. BUILD THE AGENT PLAN
// ==========================================

function buildPlan({
  intent,
  task,
  keywords,
  followUp
}) {
  const actions = [];

  if (intent === "products") {
    actions.push("search_store_products");

    if (task === "check_price") {
      actions.push("read_product_prices");
    }

    if (task === "find_discounts") {
      actions.push("check_product_discounts");
    }

    if (task === "check_availability") {
      actions.push("check_stock_status");
    }

    if (task === "compare_products") {
      actions.push("compare_product_details");
    }
  }

  if (intent === "orders") {
    actions.push("request_authorized_order_lookup");
  }

  if (intent === "reports") {
    actions.push("request_authorized_sales_report");
  }

  if (intent === "inventory") {
    actions.push("request_authorized_inventory_lookup");
  }

  if (intent === "invoices") {
    actions.push("request_authorized_invoice_lookup");
  }

  if (intent === "manage_products") {
    actions.push("request_authorized_catalog_management");
    actions.push("require_owner_approval");
  }

  if (intent === "general") {
    actions.push("understand_general_question");
  }

  if (followUp) {
    actions.push("use_conversation_context");
  }

  return {
    objective: task,
    actions,
    keywords,
    requiresStoreData: intent === "products",
    requiresConversationContext: followUp,
    requiresOwnerApproval: [
      "manage_products"
    ].includes(intent)
  };
}

// ==========================================
// 7. MAIN THINKING ENGINE
// ==========================================

async function think({
  message = "",
  history = [],
  role = "customer"
}) {
  const safeMessage = String(message).trim();

  if (!safeMessage) {
    return {
      success: false,
      error: "empty_message",
      message: "من فضلك اكتب رسالتك."
    };
  }

  const safeHistory = cleanHistory(history);

  // This role must come from trusted server-side
  // authentication, never directly from the browser.
  const allowedRole =
    role === "owner" ? "owner" : "customer";

  const intent = detectIntent(safeMessage);

  const task = detectTask(safeMessage, intent);

  const keywords = extractKeywords(safeMessage);

  const followUp = isFollowUp(
    safeMessage,
    safeHistory
  );

  const previousMessage = getPreviousUserMessage(
    safeHistory
  );

  const ownerOnlyIntents = [
    "invoices",
    "reports",
    "orders",
    "inventory",
    "manage_products"
  ];

  // Protect private store information.
  if (
    allowedRole !== "owner" &&
    ownerOnlyIntents.includes(intent)
  ) {
    return {
      success: true,
      intent,
      task,
      role: "customer",
      requiresAuthorization: true,
      context: null,
      plan: null,
      message: "هذه المعلومات متاحة لصاحب المتجر فقط."
    };
  }

  // Load product data only when the request needs it.
  let knowledge = null;

  if (intent === "products") {
    knowledge = await getStoreKnowledge();
  }

  const plan = buildPlan({
    intent,
    task,
    keywords,
    followUp
  });

  return {
    success: true,

    role: allowedRole,

    intent,
    task,

    understanding: {
      originalMessage: safeMessage,
      normalizedMessage: normalizeText(safeMessage),
      keywords,
      isFollowUp: followUp,
      previousUserMessage: followUp
        ? previousMessage
        : null
    },

    requiresAuthorization: false,

    plan,

    context: {
      currentMessage: safeMessage,
      conversationHistory: safeHistory,
      storeKnowledge: knowledge,
      intent,
      task,
      keywords,
      isFollowUp: followUp
    }
  };
}

// ==========================================
// 8. EXPORTS
// ==========================================

module.exports = {
  normalizeText,
  extractKeywords,
  detectIntent,
  detectTask,
  getStoreKnowledge,
  cleanHistory,
  isFollowUp,
  buildPlan,
  think
};
