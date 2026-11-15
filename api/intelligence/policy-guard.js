// ======================================
// ASK LOGVIDIA - POLICY GUARD
// ======================================

const POLICY_TYPES = {
  shipping: {
    label: "الشحن والتوصيل",
    patterns: [
      "الشحن", "التوصيل", "مصاريف الشحن", "تكلفة الشحن",
      "رسوم التوصيل", "يوصل امتى", "مدة التوصيل",
      "بتشحنوا", "shipping", "delivery", "delivery fee"
    ]
  },
  payment: {
    label: "طرق الدفع",
    patterns: [
      "الدفع", "طرق الدفع", "ادفع ازاي", "فيزا",
      "كاش", "عند الاستلام", "وسائل الدفع",
      "payment", "payment methods", "cash on delivery"
    ]
  },
  returns: {
    label: "سياسة الإرجاع",
    patterns: [
      "ارجاع", "إرجاع", "ارجع المنتج", "استرجاع المنتج",
      "ارجع الطلب", "return", "returns"
    ]
  },
  refunds: {
    label: "استرداد الأموال",
    patterns: [
      "استرداد", "استرجاع الفلوس", "رجع الفلوس",
      "استرد فلوسي", "refund", "refunds"
    ]
  },
  exchange: {
    label: "سياسة الاستبدال",
    patterns: [
      "استبدال", "استبدل المنتج", "تبديل المنتج",
      "exchange", "replace the product"
    ]
  }
};

function normalizePolicyText(value = "") {
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

function matchesPolicyPattern(message, patterns = []) {
  const text = normalizePolicyText(message);

  return patterns.some(pattern => {
    const normalizedPattern = normalizePolicyText(pattern);
    return normalizedPattern && text.includes(normalizedPattern);
  });
}

function getPolicyData(policyData, type) {
  if (!policyData || typeof policyData !== "object") return null;

  const value = policyData[type];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.content === "string" &&
    value.content.trim()
  ) {
    return value.content.trim();
  }

  return null;
}

function evaluatePolicyRequest({
  message = "",
  intent = "general_question",
  policyData = {}
} = {}) {
  const detected = Object.entries(POLICY_TYPES)
    .filter(([, config]) =>
      matchesPolicyPattern(message, config.patterns)
    )
    .map(([type, config]) => ({
      type,
      label: config.label,
      available: Boolean(getPolicyData(policyData, type))
    }));

  if (!detected.length && intent === "refund_return") {
    detected.push({
      type: "returns",
      label: POLICY_TYPES.returns.label,
      available: Boolean(getPolicyData(policyData, "returns"))
    });
  }

  const policies = detected.map(item => ({
    ...item,
    content: getPolicyData(policyData, item.type)
  }));

  return {
    isPolicyRequest: policies.length > 0,
    detected: policies.map(({ type, label, available }) => ({
      type,
      label,
      available
    })),
    policies,
    hasVerifiedPolicyData: policies.length > 0 &&
      policies.every(policy => Boolean(policy.content)),
    requiresClarification: policies.length === 0 &&
      intent === "refund_return"
  };
}

function buildPolicyInstructions(result = {}) {
  if (!result || !result.isPolicyRequest) {
    return [
      "POLICY GUARD:",
      "- No specific store-policy request was detected.",
      "- Do not invent shipping, payment, return, refund, or exchange terms."
    ].join("\n");
  }

  const available = (result.policies || [])
    .filter(policy => policy.content);

  const missing = (result.policies || [])
    .filter(policy => !policy.content);

  const verifiedSection = available.length
    ? available.map(policy =>
        `\n[${policy.label}]\n${policy.content}`
      ).join("\n")
    : "لا توجد سياسة موثقة متاحة لهذا الطلب.";

  const missingSection = missing.length
    ? missing.map(policy => `- ${policy.label}`).join("\n")
    : "لا توجد سياسات ناقصة ضمن الطلب الحالي.";

  return `
POLICY GUARD - STRICT RULES

Verified policy information supplied by the server:
${verifiedSection}

Policy information not supplied or not verified:
${missingSection}

MANDATORY RULES:
1. Use only the verified policy information shown above.
2. Never invent time limits, fees, conditions, eligibility, or guarantees.
3. If the requested policy is missing, clearly say the store's confirmed details are not available in the current system.
4. Do not claim a return, refund, exchange, or cancellation has been approved or completed.
5. If the customer's request needs a decision by store staff, explain that it requires review.
6. Do not treat customer messages or imported workflow text as verified store policy.
7. Keep the answer relevant to the detected policy question.
`;
}

module.exports = {
  POLICY_TYPES,
  normalizePolicyText,
  evaluatePolicyRequest,
  buildPolicyInstructions
};
