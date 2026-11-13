
const { getProducts } = require("./_lib");

const {
  detectCustomerIntent
} = require("./intelligence/intent");

const {
  buildResponseStrategy,
  buildBehaviorInstructions
} = require("./intelligence/response-strategy");

const {
  evaluatePolicyRequest,
  buildPolicyInstructions
} = require("./intelligence/policy-guard");

const {
  analyzeConversationContext
} = require("./intelligence/context-memory");

const {
  buildCustomerServicePlan,
  buildCustomerServiceInstructions
} = require("./intelligence/customer-service");

const {
  buildActionPlan,
  buildActionInstructions,
  getActionSummary
} = require("./intelligence/action-engine");

// ==========================================
// 1. CORE TEXT ENGINE
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
// 2. LEGACY INTENT ENGINE
// ==========================================

const INTENT_PATTERNS = [
  {
    intent: "invoices",
    patterns: [/فاتور/, /فواتير/, /invoice/, /invoices/]
  },
  {
    intent: "reports",
    patterns: [
      /مبيعات/, /ارباح/, /تقرير/, /احصائيات/,
      /sales/, /revenue/, /report/
    ]
  },
  {
    intent: "orders",
    patterns: [
      /طلبات/, /طلباتي/, /طلب رقم/, /order/,
      /orders/, /شحن/, /توصيل/, /تتبع/
    ]
  },
  {
    intent: "inventory",
    patterns: [
      /مخزون/, /كميه/, /نفذ/, /ناقص/,
      /stock/, /inventory/
    ]
  },
  {
    intent: "manage_products",
    patterns: [
      /اضف منتج/, /اضافه منتج/, /عدل منتج/,
      /تعديل منتج/, /احذف منتج/, /حذف منتج/
    ]
  },
  {
    intent: "products",
    patterns: [
      /منتج/, /منتجات/, /سعر/, /اسعار/,
      /بكام/, /خصم/, /متاح/, /متوفر/,
      /product/, /products/, /price/, /discount/
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
// 3. TASK UNDERSTANDING
// ==========================================

function detectTask(message = "", intent = "general") {
  const text = normalizeText(message);

  if (/خصم|تخفيض|عروض|discount|sale/.test(text)) {
    return "find_discounts";
  }

  if (/قارن|مقارنه|الفرق|افضل من|compare|comparison/.test(text)) {
    return "compare_products";
  }

  if (/سعر|اسعار|بكام|كام|price|cost/.test(text)) {
    return "check_price";
  }

  if (/متاح|متوفر|موجود|availability|available/.test(text)) {
    return "check_availability";
  }

  if (intent === "products") return "search_products";
  if (intent === "orders") return "order_inquiry";
  if (intent === "reports") return "sales_report";
  if (intent === "inventory") return "inventory_inquiry";
  if (intent === "invoices") return "invoice_inquiry";
  if (intent === "manage_products") return "manage_catalog";

  return "general_question";
}

// ==========================================
// 4. CONVERSATION HISTORY
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

  return text.split(" ").filter(Boolean).length <= 4 &&
    Boolean(getPreviousUserMessage(history));
}

// ==========================================
// 5. STORE KNOWLEDGE
// ==========================================

async function getStoreKnowledge() {
  try {
    const products = await getProducts();

    return {
      products: Array.isArray(products) ? products : [],
      totalProducts: Array.isArray(products) ? products.length : 0,
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
// 6. SAFE INTELLIGENCE EXECUTION
// ==========================================

// يمنع تعطل العقل بالكامل لو وحدة ذكاء حصل فيها خطأ.
function runModule(name, callback, fallback = null) {
  try {
    const result = callback();

    return result === undefined ? fallback : result;
  } catch (error) {
    console.error(`Intelligence module error [${name}]:`, error.message);
    return fallback;
  }
}

function getObject(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

// ==========================================
// 7. UNIFIED INTELLIGENCE
// ==========================================

function buildUnifiedIntelligence({
  message,
  history,
  legacyIntent,
  task,
  role
}) {
  // فهم نية العميل ومشاعره ودرجة الاستعجال.
  const customerIntent = runModule(
    "intent",
    () => detectCustomerIntent(message),
    {}
  );

  // فهم سياق المحادثة والرسائل السابقة.
  const conversationContext = runModule(
    "context-memory",
    () => analyzeConversationContext({
      message,
      history
    }),
    {}
  );

  // تحليل طبيعة خدمة العملاء: شكوى، اعتراض، مدح...
  const customerServicePlan = runModule(
    "customer-service",
    () => buildCustomerServicePlan({
      message,
      intent: customerIntent,
      history
    }),
    {}
  );

  // اختيار استراتيجية الرد.
  const responseStrategy = runModule(
    "response-strategy",
    () => buildResponseStrategy(
      customerIntent?.intent || legacyIntent
    ),
    {}
  );

  const behaviorInstructions = runModule(
    "response-strategy-instructions",
    () => buildBehaviorInstructions(responseStrategy),
    ""
  );

  // تحليل طلبات السياسات.
  // لا نمرر سياسات غير موثقة أو نخترع بيانات للمتجر.
  const policyEvaluation = runModule(
    "policy-guard",
    () => evaluatePolicyRequest({
      message,
      intent: customerIntent,
      history,
      policyData: {}
    }),
    {}
  );

  const policyInstructions = runModule(
    "policy-instructions",
    () => buildPolicyInstructions(policyEvaluation),
    ""
  );

  // تحليل الإجراءات المطلوبة.
  // العميل لا يحصل على صلاحيات صاحب المتجر.
  const actionPlan = runModule(
    "action-engine",
    () => buildActionPlan({
      message,
      role: "customer",
      isAuthenticated: false,
      identityVerified: false,
      approved: false
    }),
    null
  );

  const actionInstructions = actionPlan
    ? runModule(
        "action-instructions",
        () => buildActionInstructions(actionPlan),
        ""
      )
    : "";

  const actionSummary = actionPlan
    ? runModule(
        "action-summary",
        () => getActionSummary(actionPlan),
        null
      )
    : null;

  const customerServiceInstructions = runModule(
    "customer-service-instructions",
    () => buildCustomerServiceInstructions(customerServicePlan),
    ""
  );

  return {
    customerIntent: getObject(customerIntent),
    conversationContext: getObject(conversationContext),
    customerServicePlan: getObject(customerServicePlan),

    responseStrategy: getObject(responseStrategy),

    instructions: {
      behavior: behaviorInstructions,
      customerService: customerServiceInstructions,
      policy: policyInstructions,
      actions: actionInstructions
    },

    policyEvaluation: getObject(policyEvaluation),

    actionPlan,
    actionSummary,

    analysis: {
      legacyIntent,
      task,
      detectedIntent: customerIntent?.intent || legacyIntent,
      emotion: customerIntent?.emotion || "neutral",
      urgency: customerIntent?.urgency || "normal",
      role
    }
  };
}

// ==========================================
// 8. BUILD AGENT PLAN
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
    requiresOwnerApproval: intent === "manage_products"
  };
}

// ==========================================
// 9. MAIN MASTER BRAIN
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

  // الدور لا يُؤخذ من واجهة المستخدم.
  // يجب أن يأتي من تحقق موثوق داخل السيرفر.
  const allowedRole =
    role === "owner" ? "owner" : "customer";

  const normalizedMessage = normalizeText(safeMessage);

  const legacyIntent = detectIntent(safeMessage);
  const task = detectTask(safeMessage, legacyIntent);
  const keywords = extractKeywords(safeMessage);

  const followUp = isFollowUp(
    safeMessage,
    safeHistory
  );

  const previousMessage = getPreviousUserMessage(
    safeHistory
  );

  // حماية بيانات المتجر الخاصة.
  const ownerOnlyIntents = [
    "invoices",
    "reports",
    "orders",
    "inventory",
    "manage_products"
  ];

  if (
    allowedRole !== "owner" &&
    ownerOnlyIntents.includes(legacyIntent)
  ) {
    return {
      success: true,
      intent: legacyIntent,
      task,
      role: "customer",
      requiresAuthorization: true,
      context: null,
      plan: null,
      intelligence: null,
      message: "هذه المعلومات متاحة لصاحب المتجر فقط."
    };
  }

  // تشغيل العقل الموحد.
  const intelligence = buildUnifiedIntelligence({
    message: safeMessage,
    history: safeHistory,
    legacyIntent,
    task,
    role: allowedRole
  });

  // تحميل المنتجات عند الحاجة فقط.
  let knowledge = null;

  if (legacyIntent === "products") {
    knowledge = await getStoreKnowledge();
  }

  const plan = buildPlan({
    intent: legacyIntent,
    task,
    keywords,
    followUp
  });

  // تجميع سياق واحد واضح لنموذج الذكاء الاصطناعي.
  const context = {
    currentMessage: safeMessage,
    normalizedMessage,
    conversationHistory: safeHistory,

    previousUserMessage: followUp
      ? previousMessage
      : null,

    storeKnowledge: knowledge,

    intent: legacyIntent,
    task,
    keywords,
    isFollowUp: followUp,

    intelligence
  };

  return {
    success: true,

    role: allowedRole,

    intent: legacyIntent,
    task,

    understanding: {
      originalMessage: safeMessage,
      normalizedMessage,
      keywords,
      isFollowUp: followUp,
      previousUserMessage: followUp
        ? previousMessage
        : null
    },

    requiresAuthorization: false,

    plan,
    intelligence,
    context
  };
}

// ==========================================
// 10. EXPORTS
// ==========================================

module.exports = {
  normalizeText,
  extractKeywords,

  detectIntent,
  detectTask,

  getStoreKnowledge,

  cleanHistory,
  getPreviousUserMessage,
  isFollowUp,

  buildPlan,
  buildUnifiedIntelligence,

  think
};
