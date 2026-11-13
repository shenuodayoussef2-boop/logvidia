
// ============================================
// ASK LOGVIDIA - CUSTOMER INTENT ENGINE
// Version 1.0
// ============================================

function normalizeArabic(value = "") {
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

const INTENTS = {
  complaint: {
    patterns: [
      "عايز اشتكي",
      "عندي شكوي",
      "شكوي",
      "مش راضي",
      "مش مبسوط",
      "تجربتي سيئه",
      "خدمه سيئه",
      "مش عاجبني",
      "في مشكله",
      "حصلت مشكله",
      "disappointed",
      "complaint",
      "bad experience",
      "terrible service"
    ],
    priority: 10
  },

  refund_return: {
    patterns: [
      "عايز ارجع",
      "استرجاع",
      "ارجع المنتج",
      "استبدال",
      "استبدل المنتج",
      "استرد فلوسي",
      "ارجع فلوسي",
      "refund",
      "return",
      "exchange"
    ],
    priority: 10
  },

  order_tracking: {
    patterns: [
      "فين طلبي",
      "الطلب وصل فين",
      "حاله الطلب",
      "اتابع الطلب",
      "رقم التتبع",
      "الشحن وصل",
      "طلبي اتاخر",
      "طلبي متاخر",
      "my order",
      "track order",
      "order status",
      "where is my order"
    ],
    priority: 9
  },

  product_comparison: {
    patterns: [
      "قارن",
      "الفرق بين",
      "انهي احسن",
      "ايهما افضل",
      "احسن من",
      "افضل من",
      "مقارنه",
      "compare",
      "comparison",
      "difference between",
      "which is better"
    ],
    priority: 8
  },

  product_recommendation: {
    patterns: [
      "رشحلي",
      "رشح لي",
      "اقترح علي",
      "تنصحني بايه",
      "اختار ايه",
      "ايه المناسب",
      "عايز ترشيح",
      "محتاج ترشيح",
      "recommend",
      "suggest",
      "what do you recommend"
    ],
    priority: 8
  },

  product_price: {
    patterns: [
      "بكام",
      "كام سعر",
      "السعر",
      "اسعار",
      "التكلفه",
      "price",
      "how much",
      "cost"
    ],
    priority: 7
  },

  product_availability: {
    patterns: [
      "متوفر",
      "موجود",
      "لسه موجود",
      "عندكم منه",
      "خلص",
      "نفذ",
      "available",
      "in stock",
      "do you have"
    ],
    priority: 7
  },

  shipping: {
    patterns: [
      "الشحن",
      "التوصيل",
      "مصاريف الشحن",
      "تكلفه التوصيل",
      "بتوصلوا",
      "بتشحنوا",
      "يوصل امتي",
      "shipping",
      "delivery",
      "delivery fee"
    ],
    priority: 7
  },

  payment: {
    patterns: [
      "الدفع",
      "طرق الدفع",
      "فيزا",
      "كاش",
      "عند الاستلام",
      "ادفع ازاي",
      "payment",
      "cash on delivery",
      "credit card"
    ],
    priority: 7
  },

  product_question: {
    patterns: [
      "مكونات",
      "طريقه الاستخدام",
      "استخدمه ازاي",
      "تفاصيل المنتج",
      "معلومات عن المنتج",
      "بيعمل ايه",
      "product details",
      "ingredients",
      "how to use"
    ],
    priority: 6
  },

  greeting: {
    patterns: [
      "السلام عليكم",
      "صباح الخير",
      "مساء الخير",
      "اهلا",
      "اهلين",
      "هاي",
      "hello",
      "hi",
      "good morning",
      "good evening"
    ],
    priority: 3
  },

  thanks: {
    patterns: [
      "شكرا",
      "شكرا جدا",
      "متشكر",
      "تسلم",
      "ميرسي",
      "thanks",
      "thank you",
      "appreciate it"
    ],
    priority: 3
  },

  goodbye: {
    patterns: [
      "مع السلامه",
      "سلام",
      "باي",
      "اشوفك بعدين",
      "تصبح على خير",
      "goodbye",
      "bye",
      "see you"
    ],
    priority: 3
  }
};

function containsPhrase(text, phrase) {
  const normalizedPhrase = normalizeArabic(phrase);

  return (
    text === normalizedPhrase ||
    text.includes(` ${normalizedPhrase} `) ||
    text.startsWith(`${normalizedPhrase} `) ||
    text.endsWith(` ${normalizedPhrase}`)
  );
}

function detectEmotion(text) {
  const signals = {
    angry: [
      "غضبان",
      "متضايق",
      "مستفز",
      "كارثه",
      "سيئ جدا",
      "وحش جدا",
      "angry",
      "furious",
      "terrible"
    ],

    frustrated: [
      "زهقت",
      "تعبت",
      "كل شويه",
      "مش معقول",
      "بقالكم كتير",
      "frustrated",
      "annoyed"
    ],

    confused: [
      "مش فاهم",
      "مش واضح",
      "محتار",
      "يعني ايه",
      "confused",
      "unclear"
    ],

    happy: [
      "مبسوط",
      "رائع",
      "ممتاز",
      "جميل جدا",
      "عجبني",
      "happy",
      "amazing",
      "excellent"
    ]
  };

  for (const [emotion, phrases] of Object.entries(signals)) {
    if (phrases.some(phrase => containsPhrase(text, phrase))) {
      return emotion;
    }
  }

  return "neutral";
}

function detectUrgency(text, intent) {
  const urgentSignals = [
    "ضروري",
    "بسرعه",
    "حالاً",
    "فورا",
    "مستعجل",
    "urgent",
    "immediately",
    "asap"
  ];

  if (
    urgentSignals.some(signal => containsPhrase(text, signal))
  ) {
    return "high";
  }

  if (
    intent === "complaint" ||
    intent === "refund_return" ||
    intent === "order_tracking"
  ) {
    return "medium";
  }

  return "normal";
}

function detectCustomerIntent(message = "") {
  const text = normalizeArabic(message);

  if (!text) {
    return {
      intent: "unclear",
      confidence: 0,
      emotion: "neutral",
      urgency: "normal",
      requiresContext: true
    };
  }

  const matches = [];

  for (const [intent, config] of Object.entries(INTENTS)) {
    const matchedPatterns = config.patterns.filter(pattern =>
      containsPhrase(text, pattern)
    );

    if (matchedPatterns.length) {
      matches.push({
        intent,
        score:
          config.priority +
          matchedPatterns.reduce(
            (total, pattern) => total + Math.min(pattern.length / 30, 1),
            0
          ),
        matchedPatterns
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const best = matches[0];

  if (!best) {
    return {
      intent: "general_question",
      confidence: 0.35,
      emotion: detectEmotion(text),
      urgency: "normal",
      requiresContext: true,
      matchedPatterns: []
    };
  }

  const confidence = Math.min(
    0.98,
    0.65 + best.matchedPatterns.length * 0.1
  );

  return {
    intent: best.intent,
    confidence: Number(confidence.toFixed(2)),
    emotion: detectEmotion(text),
    urgency: detectUrgency(text, best.intent),
    requiresContext: [
      "product_comparison",
      "product_recommendation",
      "order_tracking",
      "general_question"
    ].includes(best.intent),
    matchedPatterns: best.matchedPatterns
  };
}

module.exports = {
  normalizeArabic,
  detectEmotion,
  detectUrgency,
  detectCustomerIntent
};
