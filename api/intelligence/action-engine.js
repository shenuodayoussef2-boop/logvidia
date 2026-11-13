
// ======================================
// ASK LOGVIDIA - ACTION ENGINE
// ======================================

// هذا الملف مسؤول عن:
// 1. اكتشاف الإجراء المطلوب.
// 2. تحديد الصلاحيات.
// 3. التحقق من المصادقة.
// 4. طلب موافقة صاحب المتجر عند الحاجة.
// 5. تجهيز خطة التنفيذ.
// 6. منع ادعاء تنفيذ إجراءات لم تحدث.

// ======================================
// TEXT NORMALIZATION
// ======================================

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(message, patterns) {
  const text = normalize(message);

  return patterns.some(pattern =>
    text.includes(normalize(pattern))
  );
}

// ======================================
// ACTION DEFINITIONS
// ======================================

const ACTIONS = {
  TRACK_ORDER: {
    id: "TRACK_ORDER",
    name: "متابعة طلب",
    category: "orders",
    allowedRoles: ["customer", "owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: true,
    requiresApproval: false,
    destructive: false,
    integration: "woocommerce_orders",
    implemented: false
  },

  CHECK_STOCK: {
    id: "CHECK_STOCK",
    name: "فحص المخزون",
    category: "inventory",
    allowedRoles: ["customer", "owner"],
    requiresAuthentication: false,
    requiresIdentityVerification: false,
    requiresApproval: false,
    destructive: false,
    integration: "woocommerce_products",
    implemented: false
  },

  INVENTORY_REPORT: {
    id: "INVENTORY_REPORT",
    name: "تقرير المخزون",
    category: "inventory",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: false,
    destructive: false,
    integration: "woocommerce_products",
    implemented: false
  },

  SALES_REPORT: {
    id: "SALES_REPORT",
    name: "تقرير المبيعات",
    category: "reports",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: false,
    destructive: false,
    integration: "woocommerce_reports",
    implemented: false
  },

  LIST_ORDERS: {
    id: "LIST_ORDERS",
    name: "عرض الطلبات",
    category: "orders",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: false,
    destructive: false,
    integration: "woocommerce_orders",
    implemented: false
  },

  CREATE_PRODUCT: {
    id: "CREATE_PRODUCT",
    name: "إضافة منتج",
    category: "products",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: false,
    integration: "woocommerce_products",
    implemented: false
  },

  UPDATE_PRODUCT: {
    id: "UPDATE_PRODUCT",
    name: "تعديل منتج",
    category: "products",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: false,
    integration: "woocommerce_products",
    implemented: false
  },

  DELETE_PRODUCT: {
    id: "DELETE_PRODUCT",
    name: "حذف منتج",
    category: "products",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: true,
    integration: "woocommerce_products",
    implemented: false
  },

  UPDATE_ORDER: {
    id: "UPDATE_ORDER",
    name: "تعديل طلب",
    category: "orders",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: true,
    integration: "woocommerce_orders",
    implemented: false
  },

  CANCEL_ORDER: {
    id: "CANCEL_ORDER",
    name: "إلغاء طلب",
    category: "orders",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: true,
    integration: "woocommerce_orders",
    implemented: false
  },

  ISSUE_REFUND: {
    id: "ISSUE_REFUND",
    name: "استرجاع مبلغ",
    category: "payments",
    allowedRoles: ["owner"],
    requiresAuthentication: true,
    requiresIdentityVerification: false,
    requiresApproval: true,
    destructive: true,
    integration: "woocommerce_refunds",
    implemented: false
  }
};

// ======================================
// INTENT PATTERNS
// ======================================

const ACTION_PATTERNS = {
  TRACK_ORDER: [
    "فين طلبي",
    "الطلب وصل فين",
    "عايز اتتبع الطلب",
    "عاوز اتتبع الطلب",
    "تتبع الطلب",
    "حالة الطلب",
    "وصل طلبي",
    "طلبي اتشحن",
    "where is my order",
    "track my order",
    "order status"
  ],

  CHECK_STOCK: [
    "متوفر",
    "متاح",
    "في المخزون",
    "عندكم منه",
    "لسه موجود",
    "هل المنتج موجود",
    "in stock",
    "available"
  ],

  INVENTORY_REPORT: [
    "تقرير المخزون",
    "حالة المخزون",
    "المنتجات الناقصة",
    "المنتجات قربت تخلص",
    "اعرض المخزون",
    "inventory report",
    "stock report"
  ],

  SALES_REPORT: [
    "تقرير المبيعات",
    "المبيعات اليوم",
    "مبيعات الشهر",
    "اجمالي المبيعات",
    "إجمالي المبيعات",
    "ارباح المتجر",
    "تقرير الارباح",
    "sales report",
    "total sales",
    "revenue report"
  ],

  LIST_ORDERS: [
    "اعرض الطلبات",
    "كل الطلبات",
    "الطلبات الجديدة",
    "الطلبات المعلقة",
    "طلبات اليوم",
    "قائمة الطلبات",
    "list orders",
    "recent orders"
  ],

  CREATE_PRODUCT: [
    "اضف منتج",
    "اضافة منتج",
    "ضيف منتج",
    "انشاء منتج",
    "انشئ منتج",
    "ارفع منتج",
    "create product",
    "add product"
  ],

  UPDATE_PRODUCT: [
    "عدل المنتج",
    "تعديل المنتج",
    "غير سعر المنتج",
    "تغيير سعر المنتج",
    "حدث المنتج",
    "تحديث المنتج",
    "update product",
    "edit product",
    "change product price"
  ],

  DELETE_PRODUCT: [
    "احذف المنتج",
    "حذف المنتج",
    "امسح المنتج",
    "الغ المنتج",
    "delete product",
    "remove product"
  ],

  UPDATE_ORDER: [
    "عدل الطلب",
    "تعديل الطلب",
    "غير بيانات الطلب",
    "تغيير بيانات الطلب",
    "update order",
    "edit order"
  ],

  CANCEL_ORDER: [
    "الغ الطلب",
    "الغاء الطلب",
    "إلغاء الطلب",
    "cancel order"
  ],

  ISSUE_REFUND: [
    "استرجاع المبلغ",
    "رجع الفلوس",
    "استرداد المبلغ",
    "اعمل استرجاع",
    "refund",
    "issue refund"
  ]
};

// ======================================
// ACTION DETECTION
// ======================================

function detectAction(message = "") {
  const text = normalize(message);

  if (!text) {
    return {
      detected: false,
      action: null,
      confidence: 0
    };
  }

  const priority = [
    "ISSUE_REFUND",
    "DELETE_PRODUCT",
    "CANCEL_ORDER",
    "UPDATE_ORDER",
    "UPDATE_PRODUCT",
    "CREATE_PRODUCT",
    "SALES_REPORT",
    "INVENTORY_REPORT",
    "LIST_ORDERS",
    "TRACK_ORDER",
    "CHECK_STOCK"
  ];

  for (const actionId of priority) {
    const patterns = ACTION_PATTERNS[actionId];

    if (matchesAny(text, patterns)) {
      return {
        detected: true,
        action: actionId,
        confidence: 0.95,
        definition: ACTIONS[actionId]
      };
    }
  }

  return {
    detected: false,
    action: null,
    confidence: 0
  };
}

// ======================================
// PERMISSION CHECK
// ======================================

function checkActionPermissions({
  action,
  role = "customer",
  isAuthenticated = false,
  identityVerified = false,
  approved = false
} = {}) {
  if (!action || !ACTIONS[action]) {
    return {
      allowed: false,
      status: "unknown_action",
      reason: "الإجراء غير معروف."
    };
  }

  const definition = ACTIONS[action];

  if (!definition.allowedRoles.includes(role)) {
    return {
      allowed: false,
      status: "forbidden",
      reason: "ليس لديك صلاحية تنفيذ هذا الإجراء."
    };
  }

  if (
    definition.requiresAuthentication &&
    !isAuthenticated
  ) {
    return {
      allowed: false,
      status: "authentication_required",
      reason: "يجب تسجيل الدخول والتحقق من الهوية أولًا."
    };
  }

  if (
    definition.requiresIdentityVerification &&
    !identityVerified
  ) {
    return {
      allowed: false,
      status: "identity_verification_required",
      reason: "يجب التحقق من هوية صاحب الطلب قبل عرض بياناته."
    };
  }

  if (
    definition.requiresApproval &&
    !approved
  ) {
    return {
      allowed: false,
      status: "approval_required",
      reason: "هذا الإجراء يحتاج موافقة صريحة من صاحب المتجر."
    };
  }

  if (!definition.implemented) {
    return {
      allowed: false,
      status: "integration_missing",
      reason: "الإجراء يحتاج إلى ربط التكامل الرسمي قبل التنفيذ."
    };
  }

  return {
    allowed: true,
    status: "authorized",
    reason: "تم اجتياز فحوصات الصلاحيات والموافقة."
  };
}

// ======================================
// BUILD ACTION PLAN
// ======================================

function buildActionPlan({
  message = "",
  role = "customer",
  isAuthenticated = false,
  identityVerified = false,
  approved = false
} = {}) {
  const detection = detectAction(message);

  if (!detection.detected) {
    return {
      success: true,
      hasAction: false,
      action: null,
      status: "no_action",
      message: "لا يوجد إجراء تنفيذي محدد."
    };
  }

  const permission = checkActionPermissions({
    action: detection.action,
    role,
    isAuthenticated,
    identityVerified,
    approved
  });

  const definition = ACTIONS[detection.action];

  return {
    success: true,
    hasAction: true,

    action: {
      id: definition.id,
      name: definition.name,
      category: definition.category,
      integration: definition.integration
    },

    confidence: detection.confidence,

    status: permission.status,
    allowed: permission.allowed,

    requiresAuthentication: definition.requiresAuthentication,
    requiresIdentityVerification: definition.requiresIdentityVerification,
    requiresApproval: definition.requiresApproval,
    destructive: definition.destructive,

    implemented: definition.implemented,

    reason: permission.reason,

    execution: {
      ready: permission.allowed && definition.implemented,
      executed: false
    }
  };
}

// ======================================
// ACTION INSTRUCTIONS FOR AI
// ======================================

function buildActionInstructions(plan) {
  if (!plan || !plan.hasAction) {
    return `
لا يوجد إجراء تنفيذي محدد في الرسالة الحالية.
أجب عن سؤال العميل بصورة طبيعية.
`;
  }

  return `
نظام تنفيذ الإجراءات:

الإجراء المطلوب: ${plan.action.name}
معرف الإجراء: ${plan.action.id}
الحالة: ${plan.status}
مسموح بالتنفيذ: ${plan.allowed ? "نعم" : "لا"}
يتطلب موافقة: ${plan.requiresApproval ? "نعم" : "لا"}
يتطلب تسجيل دخول: ${plan.requiresAuthentication ? "نعم" : "لا"}
التكامل متاح: ${plan.implemented ? "نعم" : "لا"}

سبب الحالة:
${plan.reason}

قواعد إلزامية:
- لا تدّعِ تنفيذ أي إجراء لم يتم تنفيذه فعليًا.
- لا تتجاوز صلاحيات المستخدم.
- لا تعرض بيانات طلبات العملاء دون التحقق من هويتهم.
- لا تنفذ عمليات حذف أو إلغاء أو استرجاع دون موافقة مطلوبة.
- لا تعتبر طلب المستخدم موافقة تلقائية على إجراء حساس.
- إذا كان التكامل غير متاح، وضح أن التنفيذ غير متاح حاليًا.
- لا تخترع نتائج أو أرقام طلبات أو تقارير.
- لا تعرض معلومات إدارية للعميل.
`;
}

// ======================================
// ACTION SUMMARY
// ======================================

function getActionSummary(plan) {
  if (!plan || !plan.hasAction) {
    return "لا يوجد إجراء مطلوب.";
  }

  return {
    action: plan.action.name,
    status: plan.status,
    allowed: plan.allowed,
    requiresApproval: plan.requiresApproval,
    ready: plan.execution.ready,
    executed: plan.execution.executed
  };
}

// ======================================
// EXPORTS
// ======================================

module.exports = {
  ACTIONS,
  ACTION_PATTERNS,

  normalize,
  detectAction,

  checkActionPermissions,
  buildActionPlan,

  buildActionInstructions,
  getActionSummary
};
