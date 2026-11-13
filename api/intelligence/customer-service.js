
const COMPLAINT_PATTERNS = [
  "مشكله",
  "مشكلة",
  "شكوى",
  "متضايق",
  "زعلان",
  "غاضب",
  "مش راضي",
  "مش عاجبني",
  "خدمه سيئه",
  "خدمة سيئة",
  "طلبى متاخر",
  "طلبي متأخر",
  "الطلب متاخر",
  "المنتج تالف",
  "وصل مكسور",
  "وصل غلط",
  "مش ده اللي طلبته",
  "خدمة العملاء",
  "complaint",
  "problem",
  "issue",
  "damaged",
  "broken",
  "wrong item",
  "late delivery",
  "bad service"
];

const OBJECTION_PATTERNS = [
  "غالي",
  "غالي جدا",
  "السعر عالي",
  "مش مستاهل",
  "مش مقتنع",
  "مش مناسب",
  "مش عايزه",
  "مش عايز",
  "فيه ارخص",
  "في ارخص",
  "ليه السعر ده",
  "why so expensive",
  "too expensive",
  "not worth it",
  "not interested",
  "too costly"
];

const PRAISE_PATTERNS = [
  "شكرا",
  "تسلم",
  "خدمة ممتازة",
  "ممتاز جدا",
  "حلو جدا",
  "رائع",
  "مبسوط",
  "شكرا ليكم",
  "thank you",
  "excellent service",
  "great service",
  "awesome"
];

const ESCALATION_PATTERNS = [
  "عايز اكلم موظف",
  "عاوز اكلم موظف",
  "عايز المدير",
  "عاوز المدير",
  "كلموني",
  "اتواصل مع حد",
  "خدمة العملاء البشرية",
  "موظف حقيقي",
  "human support",
  "talk to an agent",
  "speak to a person",
  "manager"
];

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

function matchesAny(text, patterns) {
  const normalized = normalize(text);

  return patterns.some(pattern =>
    normalized.includes(normalize(pattern))
  );
}

function detectCustomerServiceType(message = "") {
  if (matchesAny(message, ESCALATION_PATTERNS)) {
    return "human_support";
  }

  if (matchesAny(message, COMPLAINT_PATTERNS)) {
    return "complaint";
  }

  if (matchesAny(message, OBJECTION_PATTERNS)) {
    return "objection";
  }

  if (matchesAny(message, PRAISE_PATTERNS)) {
    return "praise";
  }

  return "general";
}

function detectComplaintSeverity(message = "", emotion = "neutral") {
  const text = normalize(message);

  const highSeverityPatterns = [
    "نصب",
    "سرقه",
    "فلوسي راحت",
    "خصموا فلوس",
    "طلب مش بتاعي",
    "بياناتي",
    "شكوى رسميه",
    "قانوني",
    "fraud",
    "scam",
    "charged twice",
    "unauthorized payment"
  ];

  const mediumSeverityPatterns = [
    "متاخر",
    "تالف",
    "مكسور",
    "غلط",
    "مش شغال",
    "مش بيرد",
    "damaged",
    "broken",
    "wrong",
    "not working",
    "delayed"
  ];

  if (matchesAny(text, highSeverityPatterns)) {
    return "high";
  }

  if (
    matchesAny(text, mediumSeverityPatterns) ||
    emotion === "angry" ||
    emotion === "frustrated"
  ) {
    return "medium";
  }

  return "normal";
}

function buildCustomerServicePlan({
  message = "",
  emotion = "neutral"
} = {}) {
  const type = detectCustomerServiceType(message);

  const severity = type === "complaint"
    ? detectComplaintSeverity(message, emotion)
    : "normal";

  const plans = {
    complaint: {
      tone: "متفهم وهادئ",
      actions: [
        "اعترف بمشكلة العميل",
        "أظهر التفهم دون مبالغة",
        "حدد المعلومات الناقصة",
        "اقترح خطوة عملية آمنة",
        "حوّل الحالة لموظف عند الحاجة"
      ],
      avoid: [
        "لوم العميل",
        "الجدال معه",
        "تقديم وعود غير مؤكدة",
        "ادعاء حل المشكلة دون تنفيذ"
      ]
    },

    objection: {
      tone: "متعاون وغير ضاغط",
      actions: [
        "افهم سبب الاعتراض",
        "قدم معلومات موثوقة",
        "قارن الخيارات المتاحة عند الطلب",
        "اترك للعميل حرية الاختيار"
      ],
      avoid: [
        "الضغط على العميل للشراء",
        "اختراع خصومات",
        "التقليل من رأيه"
      ]
    },

    praise: {
      tone: "ودود ومختصر",
      actions: [
        "اشكر العميل",
        "حافظ على أسلوب طبيعي",
        "اعرض المساعدة عند الحاجة"
      ],
      avoid: [
        "الإطالة",
        "تكرار عبارات الشكر"
      ]
    },

    human_support: {
      tone: "واضح ومتعاون",
      actions: [
        "احترم طلب التواصل مع موظف",
        "وضح أن التحويل يحتاج قناة دعم فعلية",
        "لا تدّعِ تحويل المحادثة إذا لم يحدث"
      ],
      avoid: [
        "ادعاء وجود موظف داخل المحادثة",
        "اختراع رقم هاتف أو وسيلة تواصل"
      ]
    },

    general: {
      tone: "طبيعي وودود",
      actions: [
        "افهم احتياج العميل",
        "قدم إجابة مباشرة",
        "اسأل سؤالًا توضيحيًا عند الحاجة"
      ],
      avoid: [
        "الردود المحفوظة",
        "المعلومات غير المؤكدة"
      ]
    }
  };

  return {
    type,
    severity,
    tone: plans[type].tone,
    actions: plans[type].actions,
    avoid: plans[type].avoid,
    requiresHuman: type === "human_support" ||
      (type === "complaint" && severity === "high")
  };
}

function buildCustomerServiceInstructions(plan) {
  if (!plan) return "";

  return `
خطة التعامل مع العميل:

نوع الحالة: ${plan.type}
درجة الأهمية: ${plan.severity}
نبرة الرد: ${plan.tone}

الخطوات:
${plan.actions.map(action => `- ${action}`).join("\n")}

تجنب:
${plan.avoid.map(item => `- ${item}`).join("\n")}

قواعد إضافية:
- لا تقدم وعودًا غير مؤكدة.
- لا تدّعِ أنك نفذت إجراءً لم تنفذه.
- لا تخترع بيانات تواصل أو مواعيد دعم.
- إذا طلب العميل موظفًا، وضح له ذلك بصدق.
- تعامل مع الشكاوى بجدية واحترام.
`;
}

module.exports = {
  normalize,
  detectCustomerServiceType,
  detectComplaintSeverity,
  buildCustomerServicePlan,
  buildCustomerServiceInstructions
};
