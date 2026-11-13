
const { supabaseRequest, getProducts } = require("./_lib");
const { think, normalizeText } = require("./brain");
const crypto = require("crypto");

// ======================================
// TEXT HELPERS
// ======================================

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;|&#039;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#038;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getSessionId(sessionId) {
  if (
    typeof sessionId === "string" &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
  ) {
    return sessionId;
  }

  return "session-" + crypto.randomUUID();
}

// ======================================
// CHAT MEMORY
// ======================================

async function getChatHistory(sessionId) {
  try {
    const rows = await supabaseRequest(
      `chat_logs?select=question,answer,created_at&session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=10`,
      { method: "GET" }
    );

    if (!Array.isArray(rows)) return [];

    return rows.reverse().flatMap(row => [
      {
        role: "user",
        content: row.question
      },
      {
        role: "assistant",
        content: row.answer
      }
    ]);
  } catch (error) {
    console.error("Chat history retrieval failed:", error.message);
    return [];
  }
}

async function saveChat(sessionId, question, answer) {
  try {
    await supabaseRequest("chat_logs", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        session_id: sessionId,
        question,
        answer
      })
    });
  } catch (error) {
    console.error("Chat logging failed:", error.message);
  }
}

// ======================================
// PRODUCT FORMATTING
// ======================================

function formatMoney(value, currency = "EGP") {
  if (value == null || !Number.isFinite(Number(value))) {
    return "غير محدد";
  }

  return `${Number(value).toLocaleString("en-US")} ${currency}`;
}

function hasDiscount(product) {
  return (
    Number(product.regular_price) > Number(product.price) &&
    Number(product.regular_price) > 0 &&
    product.price != null
  );
}

function formatProduct(product, index) {
  const discounted = hasDiscount(product);
  const currency = product.currency_code || "EGP";

  let pricing = `السعر: ${formatMoney(product.price, currency)}`;

  if (discounted) {
    const saved =
      Number(product.regular_price) - Number(product.price);

    const percent = product.discount_percent ||
      Math.round(saved / Number(product.regular_price) * 100);

    pricing =
      `السعر قبل الخصم: ${formatMoney(product.regular_price, currency)}\n` +
      `السعر بعد الخصم: ${formatMoney(product.price, currency)}\n` +
      `نسبة الخصم: ${percent}%\n` +
      `التوفير: ${formatMoney(saved, currency)}`;
  }

  return (
    `${index + 1}. ${cleanText(product.name)}\n` +
    `${pricing}\n` +
    `الحالة: ${product.is_in_stock ? "متوفر" : "غير متوفر"}\n` +
    `رابط المنتج: ${product.permalink || "غير متاح"}`
  );
}

function formatProductAnswer(product) {
  const currency = product.currency_code || "EGP";
  const discounted = hasDiscount(product);

  let answer = `**${cleanText(product.name)}**\n\n`;

  if (discounted) {
    const saved =
      Number(product.regular_price) - Number(product.price);

    const percent = product.discount_percent ||
      Math.round(saved / Number(product.regular_price) * 100);

    answer +=
      `السعر قبل الخصم: ${formatMoney(product.regular_price, currency)}\n` +
      `السعر بعد الخصم: ${formatMoney(product.price, currency)}\n` +
      `الخصم: ${percent}%\n` +
      `وفرت: ${formatMoney(saved, currency)}\n\n`;
  } else {
    answer +=
      `السعر الحالي: ${formatMoney(product.price, currency)}\n\n`;
  }

  answer +=
    `الحالة: ${product.is_in_stock ? "متوفر حاليًا" : "غير متوفر حاليًا"}`;

  if (product.permalink) {
    answer += `\n\nرابط المنتج: ${product.permalink}`;
  }

  return answer;
}

// ======================================
// QUESTION DETECTION
// ======================================

function isAllProductsQuestion(message) {
  const text = normalizeText(message);

  const mentionsProducts =
    /(?:المنتجات|منتجات|product|products)/.test(text);

  const asksForAll =
    /(?:كل|جميع|ما|ايه|اي|اعرض|وريني|المتاحه|المتوفره|الموجوده|عندكم|available|all|show|list)/.test(text);

  return mentionsProducts && asksForAll;
}

function isDiscountQuestion(message) {
  const text = normalizeText(message);

  return /(?:خصم|تخفيض|تخفيضات|عروض|عرض|قبل الخصم|بعد الخصم|discount|sale|offer|offers)/.test(text);
}

function isPriceQuestion(message) {
  return /(?:بكام|كام|سعر|اسعار|price|how much)/.test(
    normalizeText(message)
  );
}

function isCheapestQuestion(message) {
  const text = normalizeText(message);

  return /ارخص|الاقل سعرا|اقل سعر|cheap|cheapest|lowest price/.test(text);
}

function isCheaperThanPreviousQuestion(message) {
  const text = normalizeText(message);

  return /(?:ارخص منه|ارخص منها|اقل منه|اقل منها|ارخص من ده|ارخص من دي|cheaper than that)/.test(text);
}

// ======================================
// SMART RECOMMENDATION SYSTEM
// ======================================

function isRecommendationQuestion(message) {
  const text = normalizeText(message);

  return /(?:رشح|ترشح|رشحلي|ترشيح|انسب|مناسب|مناسبه|افضل|احسن|عايز|عاوز|محتاج|بدور على|اقترح|recommend|suggest|looking for|best for)/.test(text);
}

const RECOMMENDATION_NEEDS = {
  dry_hair: [
    "جاف",
    "جفاف",
    "ناشف",
    "ناشفه",
    "dry hair",
    "dry",
    "dehydrated hair"
  ],

  damaged_hair: [
    "تالف",
    "تالفه",
    "تلف",
    "متضرر",
    "متضرره",
    " damaged",
    "damaged hair",
    "repair"
  ],

  frizzy_hair: [
    "هيشان",
    "هايش",
    "منفوش",
    "frizzy",
    "frizz"
  ],

  hair_fall: [
    "تساقط",
    "بيسقط",
    "تساقط الشعر",
    "hair fall",
    "hair loss"
  ],

  oily_hair: [
    "دهني",
    "دهنيه",
    "دهون",
    "زيتي",
    "oily hair",
    "oily"
  ],

  dandruff: [
    "قشره",
    "قشره الشعر",
    "قشرة",
    "dandruff"
  ],

  split_ends: [
    "تقصف",
    "متقصف",
    "اطراف متقصفه",
    "split ends"
  ],

  weak_hair: [
    "ضعيف",
    "ضعيفه",
    "ضعف الشعر",
    "weak hair",
    "strengthen hair"
  ],

  skin_dryness: [
    "جفاف البشره",
    "بشره جافه",
    "جلد جاف",
    "dry skin"
  ],

  skin_oiliness: [
    "بشره دهنيه",
    "دهون البشره",
    "oily skin"
  ],

  skin_acne: [
    "حب الشباب",
    "حبوب",
    "بثور",
    "acne",
    "pimples"
  ]
};

function detectRecommendationNeeds(message) {
  const text = normalizeText(message);
  const detected = [];

  for (const [need, terms] of Object.entries(RECOMMENDATION_NEEDS)) {
    if (terms.some(term => text.includes(normalizeText(term)))) {
      detected.push(need);
    }
  }

  return detected;
}

function getRecommendationMatches(message, products) {
  const tokens = getSearchTokens(message);
  const requestedType = getProductType(tokens);
  const needs = detectRecommendationNeeds(message);

  const available = products.filter(product =>
    product.is_in_stock === true
  );

  const typeMatches = requestedType
    ? available.filter(product => {
        const nameTokens = getSearchTokens(product.name);
        return getProductType(nameTokens) === requestedType;
      })
    : available;

  const ranked = typeMatches.map(product => {
    const searchableText = normalizeText(
      cleanText(
        `${product.name || ""} ${product.description || ""}`
      )
    );

    const matchedNeeds = needs.filter(need => {
      const terms = RECOMMENDATION_NEEDS[need];

      return terms.some(term =>
        searchableText.includes(normalizeText(term))
      );
    });

    return {
      product,
      matchedNeeds,
      score:
        (requestedType ? 5 : 0) +
        matchedNeeds.length * 10
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  const matchingNeeds = needs.length > 0;

  const confirmedMatches = matchingNeeds
    ? ranked.filter(item => item.matchedNeeds.length > 0)
    : ranked;

  return {
    requestedType,
    needs,
    typeMatches: ranked.map(item => item.product),
    confirmedMatches: confirmedMatches.map(item => item.product),
    candidates: (confirmedMatches.length ? confirmedMatches : ranked)
      .slice(0, 12)
      .map(item => ({
        product: item.product,
        matchedNeeds: item.matchedNeeds
      }))
  };
}

// ======================================
// PRODUCT SEARCH
// ======================================

const SEARCH_ALIASES = {
  "لوريال": "loreal",
  "لوريل": "loreal",
  "اوريل": "loreal",
  "oreal": "loreal",
  "ماسك": "mask",
  "ماسكات": "mask",
  "شامبو": "shampoo",
  "شامبوهات": "shampoo",
  "بلسم": "conditioner",
  "سيروم": "serum",
  "زيت": "oil",
  "كريم": "cream",
  "كونديشنر": "conditioner",
  "سيرم": "serum"
};

const STOP_WORDS = new Set([
  "بكام", "كام", "سعر", "اسعار", "عندكم", "عاوز",
  "عايز", "محتاج", "موجود", "متاح", "المنتج",
  "منتج", "المنتجات", "لو", "سمحت", "من", "في",
  "على", "عليه", "عليها", "قبل", "بعد", "الخصم",
  "خصم", "تخفيض", "تخفيضات", "عروض", "عرض",
  "عندكو", "ممكن", "ايه", "هو", "هي", "هل",
  "the", "price", "how", "much", "is", "what",
  "discount", "sale", "please", "do", "you",
  "have", "for", "me", "show", "find"
]);

const PRODUCT_TYPES = {
  mask: ["mask"],
  shampoo: ["shampoo"],
  conditioner: ["conditioner"],
  serum: ["serum"],
  oil: ["oil"],
  cream: ["cream"]
};

function canonicalToken(word) {
  return SEARCH_ALIASES[word] || word;
}

function getSearchTokens(value = "") {
  return normalizeText(cleanText(value))
    .split(/\s+/)
    .map(canonicalToken)
    .filter(word => word.length >= 2);
}

function getProductType(tokens) {
  for (const [type, aliases] of Object.entries(PRODUCT_TYPES)) {
    if (tokens.some(token => aliases.includes(token))) {
      return type;
    }
  }

  return null;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    previous = current;
  }

  return previous[b.length];
}

function tokenSimilarity(queryToken, productTokens) {
  if (productTokens.includes(queryToken)) {
    return 1;
  }

  if (queryToken.length < 4) {
    return 0;
  }

  let best = 0;

  for (const productToken of productTokens) {
    if (Math.abs(queryToken.length - productToken.length) > 2) {
      continue;
    }

    const distance = levenshteinDistance(
      queryToken,
      productToken
    );

    const allowedDistance =
      queryToken.length >= 8 ? 2 : 1;

    if (distance <= allowedDistance) {
      const similarity =
        1 - distance / Math.max(queryToken.length, productToken.length);

      best = Math.max(best, similarity);
    }
  }

  return best;
}

function findMatchingProducts(message, products) {
  const queryTokens = getSearchTokens(message);

  const searchWords = queryTokens.filter(
    word => !STOP_WORDS.has(word)
  );

  const queryType = getProductType(queryTokens);

  if (!searchWords.length) {
    return [];
  }

  const ranked = products.map(product => {
    const nameTokens = getSearchTokens(product.name);

    const descriptionTokens = getSearchTokens(
      product.description || ""
    );

    const productType = getProductType(nameTokens);

    let score = 0;
    let matchedNameWords = 0;

    for (const word of searchWords) {
      const nameSimilarity = tokenSimilarity(word, nameTokens);

      const descriptionSimilarity = tokenSimilarity(
        word,
        descriptionTokens
      );

      if (nameSimilarity === 1) {
        score += word.length >= 5 ? 6 : 4;
        matchedNameWords++;
      } else if (nameSimilarity >= 0.75) {
        score += 3.5;
        matchedNameWords++;
      } else if (descriptionSimilarity === 1) {
        score += 0.8;
      } else if (descriptionSimilarity >= 0.75) {
        score += 0.4;
      }
    }

    if (searchWords.length >= 2) {
      for (
        let i = 0;
        i <= nameTokens.length - searchWords.length;
        i++
      ) {
        const phrase = nameTokens
          .slice(i, i + searchWords.length)
          .join(" ");

        if (phrase === searchWords.join(" ")) {
          score += 15;
          break;
        }
      }
    }

    if (queryType && productType) {
      if (queryType === productType) {
        score += 7;
      } else {
        score -= 15;
      }
    }

    if (matchedNameWords >= 2) {
      score += 2;
    }

    return {
      product,
      score,
      matchedNameWords,
      productType
    };
  });

  return ranked
    .filter(item => item.score >= 7)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.matchedNameWords - a.matchedNameWords;
    });
}

function selectBestMatches(rankedProducts) {
  if (!rankedProducts.length) {
    return [];
  }

  const best = rankedProducts[0];

  if (
    rankedProducts.length === 1 ||
    best.score - rankedProducts[1].score >= 5
  ) {
    return [best.product];
  }

  return rankedProducts
    .filter(item => item.score >= best.score - 3)
    .slice(0, 4)
    .map(item => item.product);
}

// ======================================
// CHEAPER PRODUCT SEARCH
// ======================================

function findCheapestBelow(products, referencePrice) {
  return products
    .filter(product =>
      product.is_in_stock === true &&
      product.price != null &&
      Number.isFinite(Number(product.price)) &&
      Number(product.price) > 0 &&
      Number(product.price) < referencePrice
    )
    .sort((a, b) => Number(a.price) - Number(b.price));
}

// ======================================
// MAIN API
// ======================================

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { message, sessionId } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "اكتب سؤالك أولاً."
      });
    }

    if (message.length > 1500) {
      return res.status(400).json({
        success: false,
        error: "السؤال طويل جدًا."
      });
    }

    const question = message.trim();
    const currentSessionId = getSessionId(sessionId);

    // استرجاع المحادثة السابقة.
    const history = await getChatHistory(currentSessionId);

    const brain = await think({
      message: question,
      history,
      role: "customer"
    });

    if (!brain.success) {
      throw new Error("Brain could not process the request.");
    }

    if (brain.requiresAuthorization) {
      return res.status(403).json({
        success: false,
        error: "هذه المعلومات متاحة لصاحب المتجر فقط."
      });
    }

    let products = brain.context?.storeKnowledge?.products || [];

    if (!Array.isArray(products)) {
      throw new Error("Invalid store knowledge.");
    }

    if (!products.length) {
      products = await getProducts();
    }

    // ======================================
    // CHEAPER THAN PREVIOUS PRODUCT
    // ======================================

    if (isCheaperThanPreviousQuestion(question)) {
      const previousAssistantMessage = [...history]
        .reverse()
        .find(item => item.role === "assistant");

      const previousUserMessage = [...history]
        .reverse()
        .find(item => item.role === "user");

      const previousText = [
        previousAssistantMessage?.content || "",
        previousUserMessage?.content || ""
      ].join(" ");

      const priceMatch = previousText.match(
        /(?:السعر الحالي|السعر بعد الخصم|السعر)\s*:\s*([\d,.]+)/
      );

      const referencePrice = priceMatch
        ? Number(priceMatch[1].replace(/,/g, ""))
        : null;

      if (
        referencePrice == null ||
        !Number.isFinite(referencePrice)
      ) {
        const answer =
          "تقصد أرخص من أنهي منتج؟ ابعتلي اسمه أو سعره وأنا أقارن لك.";

        await saveChat(currentSessionId, question, answer);

        return res.status(200).json({
          success: true,
          answer,
          sessionId: currentSessionId,
          intent: "products"
        });
      }

      const cheaperProducts = findCheapestBelow(
        products,
        referencePrice
      );

      const answer = cheaperProducts.length
        ? (
            `أيوه، لقيت منتجات أرخص من ${formatMoney(referencePrice)}:\n\n` +
            cheaperProducts.slice(0, 5)
              .map(formatProductAnswer)
              .join("\n\n")
          )
        : `لا، مفيش منتج متاح بسعر أقل من ${formatMoney(referencePrice)} حاليًا.`;

      await saveChat(currentSessionId, question, answer);

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: "products"
      });
    }

    // ======================================
    // CHEAPEST PRODUCT
    // ======================================

    if (isCheapestQuestion(question)) {
      const available = products
        .filter(product =>
          product.is_in_stock === true &&
          product.price != null &&
          Number.isFinite(Number(product.price)) &&
          Number(product.price) > 0
        )
        .sort((a, b) => Number(a.price) - Number(b.price));

      const answer = available.length
        ? `أرخص منتج متاح عندنا حاليًا هو:\n\n${formatProductAnswer(available[0])}`
        : "مش قادر أحدد أرخص منتج متاح حاليًا.";

      await saveChat(currentSessionId, question, answer);

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: "products"
      });
    }

    // ======================================
    // ALL PRODUCTS
    // ======================================

    if (isAllProductsQuestion(question)) {
      const availableProducts = products.filter(
        product => product.is_in_stock === true
      );

      const answer = availableProducts.length
        ? (
            `أهلًا بك في Logvidia!\n` +
            `دي المنتجات المتاحة حاليًا (${availableProducts.length} منتج):\n\n` +
            availableProducts.map(formatProduct).join("\n\n")
          )
        : "لا توجد منتجات متاحة حاليًا في المتجر.";

      await saveChat(currentSessionId, question, answer);

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: brain.intent
      });
    }

    // ======================================
    // SMART RECOMMENDATIONS
    // ======================================

    const recommendationRequest =
      isRecommendationQuestion(question);

    let recommendationData = null;

    if (recommendationRequest) {
      recommendationData = getRecommendationMatches(
        question,
        products
      );
    }

    // ======================================
    // PRODUCT SEARCH
    // ======================================

    const rankedProducts = findMatchingProducts(
      question,
      products
    );

    const matchedProducts = selectBestMatches(rankedProducts);

    if (
      !recommendationRequest &&
      matchedProducts.length > 0 &&
      (
        isDiscountQuestion(question) ||
        isPriceQuestion(question)
      )
    ) {
      let answer;

      if (matchedProducts.length === 1) {
        answer = formatProductAnswer(matchedProducts[0]);
      } else {
        answer =
          "لقيت أكتر من منتج قريب من وصفك. تقصد أنهي واحد؟\n\n" +
          matchedProducts.map(formatProduct).join("\n\n") +
          "\n\nاكتب اسم المنتج أو نوعه عشان أحدد لك السعر والخصم بدقة.";
      }

      await saveChat(currentSessionId, question, answer);

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: brain.intent
      });
    }

    // ======================================
    // PREPARE REAL STORE CATALOG
    // ======================================

    const catalog = products.map(product => ({
      id: product.woo_id,
      name: cleanText(product.name),
      description: cleanText(product.description || ""),
      currentPrice: product.price,
      regularPrice: product.regular_price,
      salePrice: product.sale_price,
      discountPercent: product.discount_percent,
      currency: product.currency_code || "EGP",
      inStock: Boolean(product.is_in_stock),
      url: product.permalink || null
    }));

    // المنتجات المرشحة للتوصية فقط.
    const recommendationCandidates = recommendationData
      ? recommendationData.candidates.map(item => ({
          id: item.product.woo_id,
          name: cleanText(item.product.name),
          description: cleanText(item.product.description || ""),
          currentPrice: item.product.price,
          regularPrice: item.product.regular_price,
          discountPercent: item.product.discount_percent,
          currency: item.product.currency_code || "EGP",
          inStock: Boolean(item.product.is_in_stock),
          matchedNeeds: item.matchedNeeds,
          url: item.product.permalink || null
        }))
      : [];

    // ======================================
    // GEMINI
    // ======================================

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;

    if (!apiKey || !model) {
      throw new Error("Gemini configuration is missing.");
    }

    const historyText = history.map(item =>
      `${item.role === "user" ? "العميل" : "المساعد"}: ${item.content}`
    ).join("\n\n");

    const recommendationInstructions = recommendationRequest
      ? `
هذا الطلب هو طلب توصية بمنتج.

بيانات التوصية:
${JSON.stringify({
  requestedType: recommendationData.requestedType,
  detectedNeeds: recommendationData.needs,
  candidates: recommendationCandidates
})}

قواعد التوصيات:
- رشّح منتجات من قائمة candidates فقط.
- لا ترشّح منتجًا غير متوفر.
- لا تخترع فوائد أو مكونات أو نتائج غير موجودة في اسم المنتج أو وصفه.
- استخدم matchedNeeds كإشارة مساعدة فقط، ولا تعتبرها دليلًا طبيًا.
- إذا لم توجد منتجات تطابق احتياج العميل بوضوح، قل ذلك بصراحة.
- إذا وجدت منتجات من نفس النوع لكن وصفها لا يؤكد تلبية الاحتياج، وضّح هذا للعميل.
- لا تدّعِ أن منتجًا يعالج مرضًا أو مشكلة طبية.
- اعرض السعر الحالي والخصم الحقيقي ورابط المنتج عند توفرها.
- إذا كان طلب العميل غير واضح، اسأله سؤالًا واحدًا محددًا.
- لا تعرض كل المنتجات؛ اختر حتى 3 منتجات مناسبة فقط.
- اشرح باختصار سبب اختيار كل منتج اعتمادًا على البيانات المتاحة.
`
      : "";

    const prompt = `
أنت Ask Logvidia، وكيل ذكاء اصطناعي متخصص في خدمة عملاء متجر Logvidia.

افهم العربية المصرية والفصحى والإنجليزية وأخطاء الكتابة.
استخدم بيانات المنتجات الحقيقية فقط.

ذاكرة المحادثة السابقة:
${historyText || "لا توجد محادثة سابقة."}

قواعد الذاكرة:
- استخدم المحادثة السابقة لفهم الإشارات مثل: ده، دي، منه، منها، المنتج السابق.
- اربط سؤال العميل الحالي بالسياق السابق عندما يكون ذلك منطقيًا.
- لا تعتبر سؤالًا جديدًا متابعة إذا كان موضوعه مختلفًا.
- لا تخترع تفاصيل غير موجودة في المحادثة أو بيانات المتجر.

قواعد الأسعار:
- currentPrice هو السعر الحالي الذي يدفعه العميل.
- regularPrice هو السعر الأصلي قبل الخصم.
- salePrice هو سعر التخفيض.
- discountPercent هي نسبة الخصم المحسوبة.
- إذا كان regularPrice أكبر من currentPrice، اعرض السعر قبل الخصم وبعد الخصم ونسبة الخصم.
- لا تقل إن هناك خصمًا إذا لم يظهر فرق حقيقي بين السعرين.
- لا تخترع سعرًا أو نسبة خصم.
- لا تستخدم سعرًا من الذاكرة أو من خارج بيانات المتجر.
- اذكر رابط المنتج عند توفره.

قواعد البحث:
- اهتم باسم المنتج ونوعه أكثر من وصفه.
- لا تخلط بين الماسك والشامبو والبلسم والسيروم.
- إذا وجدت منتجات متشابهة، اعرض الاختيارات واسأل العميل عن النوع المقصود.
- لا تختر منتجًا عشوائيًا عند وجود أكثر من تطابق قوي.

${recommendationInstructions}

قواعد عامة:
- أجب مباشرة وبأسلوب طبيعي وودود.
- قارن المنتجات عند الطلب.
- اسأل سؤالًا توضيحيًا عند عدم وضوح المنتج.
- لا تدّعِ تنفيذ شراء أو تعديل أو حجز.
- لا تكشف بيانات العملاء أو الفواتير أو المعلومات الإدارية.
- لا تدّعِ امتلاك صلاحيات صاحب المتجر.
- أجب بلغة العميل.
- لا تعرض JSON أو معلومات تقنية.

نوع الطلب:
${brain.intent}

بيانات المنتجات الحقيقية:
${JSON.stringify(catalog)}

رسالة العميل الحالية:
${question}

اكتب إجابة دقيقة ومفيدة.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1800
          }
        }),
        signal: AbortSignal.timeout(12000)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", response.status, result);

      if (response.status === 429) {
        return res.status(503).json({
          success: false,
          error: "وصل المساعد إلى حد الاستخدام الحالي. حاول مرة أخرى لاحقًا."
        });
      }

      return res.status(502).json({
        success: false,
        error: "تعذر الحصول على رد من المساعد حاليًا."
      });
    }

    const answer = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      throw new Error("Gemini returned an empty response.");
    }

    await saveChat(currentSessionId, question, answer);

    return res.status(200).json({
      success: true,
      answer,
      sessionId: currentSessionId,
      intent: recommendationRequest
        ? "recommendations"
        : brain.intent
    });

  } catch (error) {
    console.error("Chat API error:", error.message);

    const timedOut =
      error.name === "TimeoutError" ||
      error.name === "AbortError";

    return res.status(timedOut ? 504 : 500).json({
      success: false,
      error: timedOut
        ? "المساعد استغرق وقتًا طويلًا. جرّب سؤالًا أبسط."
        : "حدث خطأ أثناء معالجة سؤالك."
    });
  }
};
