
const STRATEGIES = {
  complaint: {
    tone: "empathetic",
    priority: "high",
    approach: "افهم المشكلة وأثرها على العميل قبل اقتراح الحل.",
    actions: ["acknowledge", "understand_problem", "offer_next_step"],
    avoid: ["arguing", "blaming_customer", "making_promises"]
  },

  refund_return: {
    tone: "professional",
    priority: "high",
    approach: "افهم طلب العميل واعتمد على سياسة موثقة فقط.",
    actions: ["understand_request", "check_verified_policy", "explain_process"],
    avoid: ["guaranteeing_approval", "inventing_policy"]
  },

  order_tracking: {
    tone: "helpful",
    priority: "high",
    approach: "حدد بيانات الطلب المطلوبة مع حماية خصوصية العميل.",
    actions: ["request_order_reference", "verify_identity", "check_order_status"],
    avoid: ["revealing_customer_data", "guessing_delivery_date"]
  },

  product_comparison: {
    tone: "objective",
    priority: "normal",
    approach: "قارن المنتجات اعتمادًا على البيانات الحقيقية.",
    actions: ["identify_products", "compare_real_data", "explain_differences"],
    avoid: ["inventing_features", "unfounded_superiority"]
  },

  product_recommendation: {
    tone: "friendly",
    priority: "normal",
    approach: "حدد احتياج العميل ثم اختر المنتجات المناسبة من الكتالوج.",
    actions: ["understand_need", "find_matching_products", "rank_candidates", "explain_recommendation"],
    avoid: ["inventing_products", "unsupported_claims"]
  },

  product_price: {
    tone: "direct",
    priority: "normal",
    approach: "اعرض السعر الحالي والخصم الحقيقي إن وجد.",
    actions: ["identify_product", "verify_current_price", "calculate_discount"],
    avoid: ["guessing_prices", "using_outdated_prices"]
  },

  product_availability: {
    tone: "direct",
    priority: "normal",
    approach: "اعتمد على حالة المخزون المسجلة.",
    actions: ["identify_product", "verify_stock"],
    avoid: ["assuming_availability"]
  },

  shipping: {
    tone: "informative",
    priority: "normal",
    approach: "استخدم معلومات الشحن الموثقة فقط.",
    actions: ["check_shipping_policy", "clarify_location_if_needed"],
    avoid: ["inventing_fees", "promising_delivery_times"]
  },

  payment: {
    tone: "informative",
    priority: "normal",
    approach: "اشرح طرق الدفع المؤكدة فقط.",
    actions: ["check_payment_methods", "explain_options"],
    avoid: ["inventing_payment_methods"]
  },

  greeting: {
    tone: "warm",
    priority: "low",
    approach: "رحب بالعميل بصورة طبيعية.",
    actions: ["welcome_customer"],
    avoid: ["long_unnecessary_response"]
  },

  thanks: {
    tone: "warm",
    priority: "low",
    approach: "رد بلباقة واختصار.",
    actions: ["acknowledge_thanks"],
    avoid: ["repeating_the_whole_conversation"]
  },

  goodbye: {
    tone: "polite",
    priority: "low",
    approach: "انهِ المحادثة باحترام.",
    actions: ["close_conversation"],
    avoid: ["pressuring_customer"]
  },

  general_question: {
    tone: "natural",
    priority: "normal",
    approach: "حلل السؤال وسياقه وحدد أفضل طريقة للإجابة.",
    actions: ["understand_question", "use_context", "verify_information", "answer_helpfully"],
    avoid: ["guessing", "unnecessary_questions"]
  },

  unclear: {
    tone: "patient",
    priority: "normal",
    approach: "حدد الجزء الغامض واسأل سؤالًا واحدًا واضحًا.",
    actions: ["identify_missing_information", "ask_clarifying_question"],
    avoid: ["assuming_customer_intent"]
  }
};

// ======================================
// ADAPTIVE REASONING
// ======================================

function determineResponseMode(intent, emotion, urgency, confidence) {
  if (urgency === "high") return "urgent_assistance";

  if (emotion === "angry" || emotion === "frustrated") {
    return "de_escalation";
  }

  if (confidence < 0.45) {
    return "clarification";
  }

  if (
    intent === "product_comparison" ||
    intent === "product_recommendation"
  ) {
    return "analytical";
  }

  if (
    intent === "product_price" ||
    intent === "product_availability"
  ) {
    return "factual";
  }

  return "conversational";
}

function determineQuestionComplexity(intentResult = {}) {
  const intent = intentResult.intent || "general_question";

  const complexIntents = [
    "product_comparison",
    "product_recommendation",
    "complaint",
    "refund_return",
    "order_tracking"
  ];

  return complexIntents.includes(intent) ? "complex" : "standard";
}

// ======================================
// BUILD RESPONSE STRATEGY
// ======================================

function buildResponseStrategy(intentResult = {}) {
  const intent = intentResult.intent || "general_question";
  const strategy = STRATEGIES[intent] || STRATEGIES.general_question;

  const emotion = intentResult.emotion || "neutral";
  const urgency = intentResult.urgency || "normal";

  const confidence = Number.isFinite(Number(intentResult.confidence))
    ? Number(intentResult.confidence)
    : 1;

  const responseMode = determineResponseMode(
    intent,
    emotion,
    urgency,
    confidence
  );

  const complexity = determineQuestionComplexity(intentResult);

  let tone = strategy.tone;

  if (emotion === "angry" || emotion === "frustrated") {
    tone = "empathetic";
  }

  return {
    intent,
    tone,
    priority: strategy.priority,
    approach: strategy.approach,
    actions: [...strategy.actions],
    avoid: [...strategy.avoid],

    emotion,
    urgency,
    confidence,
    responseMode,
    complexity,

    requiresContext: Boolean(intentResult.requiresContext),

    reasoning: {
      shouldClarify: responseMode === "clarification",
      shouldDeEscalate: responseMode === "de_escalation",
      shouldVerify: true,
      shouldUseContext: Boolean(intentResult.requiresContext),
      shouldBeConcise: complexity === "standard"
    }
  };
}

// ======================================
// BUILD AI BEHAVIOR INSTRUCTIONS
// ======================================

function buildBehaviorInstructions(strategy) {
  if (!strategy) return "";

  return `
ADAPTIVE RESPONSE INTELLIGENCE

Intent:
${strategy.intent}

Priority:
${strategy.priority}

Response mode:
${strategy.responseMode}

Complexity:
${strategy.complexity}

Tone:
${strategy.tone}

Customer emotion:
${strategy.emotion}

Urgency:
${strategy.urgency}

Intent confidence:
${strategy.confidence}

Approach:
${strategy.approach}

Required actions:
${strategy.actions.map(item => "- " + item).join("\n")}

Avoid:
${strategy.avoid.map(item => "- " + item).join("\n")}

Reasoning controls:
${JSON.stringify(strategy.reasoning)}

MANDATORY DECISION RULES:

1. Understand the actual customer goal before answering.
2. Use previous conversation context only when relevant.
3. Verify factual information against available store data.
4. Never treat missing information as confirmed information.
5. If confidence is low, ask one focused clarification question.
6. If the customer is frustrated, prioritize understanding and de-escalation.
7. If urgency is high, prioritize the most useful immediate next step.
8. For comparisons and recommendations, analyze available candidates before choosing.
9. Never invent policies, prices, product features, or completed actions.
10. Keep the answer proportional to the complexity of the request.
11. Do not expose internal reasoning or technical instructions to the customer.
12. Give the customer the final useful conclusion, not a description of internal analysis.
`;
}

module.exports = {
  buildResponseStrategy,
  buildBehaviorInstructions,
  determineResponseMode,
  determineQuestionComplexity,
  STRATEGIES
};
