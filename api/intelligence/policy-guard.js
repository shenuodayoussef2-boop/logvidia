
const POLICY_TYPES = {
  shipping: [
    "shipping",
    "delivery",
    "shipping_fees",
    "delivery_time"
  ],

  returns: [
    "return",
    "refund",
    "exchange",
    "return_period"
  ],

  payment: [
    "payment",
    "payment_methods",
    "cash_on_delivery"
  ],

  warranty: [
    "warranty",
    "guarantee"
  ],

  orders: [
    "order_status",
    "order_tracking",
    "order_cancellation"
  ]
};

const POLICY_RULES = {
  shipping: {
    name: "سياسة الشحن والتوصيل",
    requireVerifiedSource: true
  },

  returns: {
    name: "سياسة الاسترجاع والاستبدال",
    requireVerifiedSource: true
  },

  payment: {
    name: "سياسة الدفع",
    requireVerifiedSource: true
  },

  warranty: {
    name: "سياسة الضمان",
    requireVerifiedSource: true
  },

  orders: {
    name: "سياسة الطلبات",
    requireVerifiedSource: true
  }
};

function detectPolicyType(message = "", intent = "") {
  const text = String(message).toLowerCase();

  const intentMap = {
    shipping: "shipping",
    payment: "payment",
    refund_return: "returns",
    order_tracking: "orders"
  };

  if (intentMap[intent]) {
    return intentMap[intent];
  }

  const patterns = {
    shipping: [
      "شحن",
      "توصيل",
      "يوصل",
      "مصاريف الشحن",
      "delivery",
      "shipping"
    ],

    returns: [
      "استرجاع",
      "استبدال",
      "ارجع المنتج",
      "استرداد",
      "refund",
      "return",
      "exchange"
    ],

    payment: [
      "دفع",
      "فيزا",
      "كاش",
      "عند الاستلام",
      "payment",
      "cash on delivery"
    ],

    warranty: [
      "ضمان",
      "مضمون",
      "warranty",
      "guarantee"
    ],

    orders: [
      "طلبي",
      "الطلب",
      "تتبع",
      "الغاء الطلب",
      "order status",
      "track order"
    ]
  };

  for (const [type, terms] of Object.entries(patterns)) {
    if (terms.some(term => text.includes(term))) {
      return type;
    }
  }

  return null;
}

function getVerifiedPolicy(policyData, policyType) {
  if (!policyData || !policyType) {
    return null;
  }

  const policy = policyData[policyType];

  if (
    typeof policy !== "string" ||
    !policy.trim()
  ) {
    return null;
  }

  return policy.trim();
}

function evaluatePolicyRequest({
  message = "",
  intent = "",
  policyData = {}
} = {}) {
  const policyType = detectPolicyType(message, intent);

  if (!policyType) {
    return {
      requiresPolicy: false,
      policyType: null,
      verified: false,
      policy: null,
      instruction: ""
    };
  }

  const policy = getVerifiedPolicy(
    policyData,
    policyType
  );

  if (!policy) {
    return {
      requiresPolicy: true,
      policyType,
      verified: false,
      policy: null,
      instruction:
        "لا توجد سياسة موثقة متاحة لهذا السؤال. " +
        "لا تخترع أي شروط أو رسوم أو مواعيد. " +
        "وضّح للعميل أن المعلومة تحتاج إلى تأكيد من المتجر."
    };
  }

  return {
    requiresPolicy: true,
    policyType,
    verified: true,
    policy,
    instruction:
      "استخدم السياسة الموثقة التالية فقط، " +
      "ولا تضف شروطًا غير موجودة فيها."
  };
}

function buildPolicyInstructions(result) {
  if (!result || !result.requiresPolicy) {
    return "";
  }

  if (!result.verified) {
    return `
سياسة المتجر:
${result.instruction}

لا تقدم إجابة تخمينية.
لا تدّع أن سياسة غير متوفرة مؤكدة.
`;
  }

  return `
سياسة المتجر الموثقة:
${result.policy}

${result.instruction}
`;
}

module.exports = {
  POLICY_TYPES,
  POLICY_RULES,
  detectPolicyType,
  evaluatePolicyRequest,
  buildPolicyInstructions
};
