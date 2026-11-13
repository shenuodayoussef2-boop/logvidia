
const STRATEGIES = {
  complaint: {
    tone: "empathetic",
    approach: "اعترف بانزعاج العميل، وأظهر تفهمك، ثم اسأله عن تفاصيل المشكلة إذا كانت غير واضحة.",
    actions: ["acknowledge", "understand_problem", "offer_next_step"],
    avoid: ["arguing", "blaming_customer", "making_promises"]
  },

  refund_return: {
    tone: "professional",
    approach: "افهم سبب طلب الاسترجاع أو الاستبدال، ثم وضح السياسة الرسمية للمتجر.",
    actions: ["understand_request", "check_store_policy", "explain_process"],
    avoid: ["guaranteeing_approval", "inventing_policy"]
  },

  order_tracking: {
    tone: "helpful",
    approach: "اعرض المساعدة في معرفة حالة الطلب، واطلب بيانات التحقق الضرورية فقط.",
    actions: ["request_order_reference", "verify_identity", "check_order_status"],
    avoid: ["revealing_customer_data", "guessing_delivery_date"]
  },

  product_comparison: {
    tone: "objective",
    approach: "قارن المنتجات بناءً على الأسعار والمواصفات والبيانات المتاحة.",
    actions: ["identify_products", "compare_real_data", "explain_differences"],
    avoid: ["inventing_features", "unfounded_superiority"]
  },

  product_recommendation: {
    tone: "friendly",
    approach: "افهم احتياج العميل أولًا، ثم رشح منتجات موجودة فعلًا في المتجر.",
    actions: ["understand_need", "find_matching_products", "explain_recommendation"],
    avoid: ["inventing_products", "unsupported_claims"]
  },

  product_price: {
    tone: "direct",
    approach: "أجب بالسعر الحالي الحقيقي، ووضح الخصم إن وجد.",
    actions: ["find_product", "read_current_price", "explain_discount"],
    avoid: ["guessing_prices", "using_outdated_prices"]
  },

  product_availability: {
    tone: "direct",
    approach: "تحقق من حالة توفر المنتج قبل الإجابة.",
    actions: ["find_product", "check_stock"],
    avoid: ["assuming_availability"]
  },

  shipping: {
    tone: "informative",
    approach: "اعتمد على سياسة الشحن الرسمية فقط، واطلب المنطقة إذا كانت ضرورية.",
    actions: ["check_shipping_policy", "clarify_location_if_needed"],
    avoid: ["inventing_fees", "promising_delivery_times"]
  },

  payment: {
    tone: "informative",
    approach: "اشرح طرق الدفع المتاحة وفق معلومات المتجر.",
    actions: ["check_payment_methods", "explain_options"],
    avoid: ["inventing_payment_methods"]
  },

  greeting: {
    tone: "warm",
    approach: "رحب بالعميل بشكل طبيعي وافتح له المجال للسؤال.",
    actions: ["welcome_customer"],
    avoid: ["long_unnecessary_response"]
  },

  thanks: {
    tone: "warm",
    approach: "اشكر العميل ورد باختصار ولباقة.",
    actions: ["acknowledge_thanks"],
    avoid: ["repeating_the_whole_conversation"]
  },

  goodbye: {
    tone: "polite",
    approach: "انهِ المحادثة بطريقة ودودة ومهنية.",
    actions: ["close_conversation"],
    avoid: ["pressuring_customer"]
  },

  general_question: {
    tone: "natural",
    approach: "افهم السؤال من سياقه، ثم أجب بالمعلومات الموثوقة المتاحة.",
    actions: ["understand_question", "use_context", "answer_helpfully"],
    avoid: ["guessing", "unnecessary_questions"]
  },

  unclear: {
    tone: "patient",
    approach: "اطلب توضيحًا واحدًا ومحددًا يساعد على فهم المطلوب.",
    actions: ["ask_clarifying_question"],
    avoid: ["assuming_customer_intent"]
  }
};

function buildResponseStrategy(intentResult = {}) {
  const intent = intentResult.intent || "general_question";

  const strategy =
    STRATEGIES[intent] || STRATEGIES.general_question;

  return {
    intent,
    tone: strategy.tone,
    approach: strategy.approach,
    actions: [...strategy.actions],
    avoid: [...strategy.avoid],
    emotion: intentResult.emotion || "neutral",
    urgency: intentResult.urgency || "normal",
    requiresContext: Boolean(intentResult.requiresContext)
  };
}

function buildBehaviorInstructions(strategy) {
  if (!strategy) return "";

  return `
تعليمات التعامل مع العميل:

نوع الطلب: ${strategy.intent}
نبرة الرد: ${strategy.tone}
طريقة التعامل: ${strategy.approach}
حالة العميل العاطفية: ${strategy.emotion}
درجة الاستعجال: ${strategy.urgency}

الإجراءات المطلوبة:
${strategy.actions.map(item => "- " + item).join("\n")}

تجنب:
${strategy.avoid.map(item => "- " + item).join("\n")}

تعامل كموظف خدمة عملاء محترف.
لا تكرر الأسئلة التي أجاب عنها العميل سابقًا.
لا تخترع سياسات أو معلومات.
لا تدّع تنفيذ إجراء لم يتم تنفيذه فعليًا.
`;
}

module.exports = {
  buildResponseStrategy,
  buildBehaviorInstructions,
  STRATEGIES
};
