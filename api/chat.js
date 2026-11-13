
const { supabaseRequest, getProducts } = require("./_lib");
const { think, normalizeText } = require("./brain");
const crypto = require("crypto");

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

async function saveChat(sessionId, question, answer) {
  try {
    await supabaseRequest("chat_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
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
    const saved = Number(product.regular_price) - Number(product.price);
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

// اكتشاف طلب أرخص منتج.
function isCheapestQuestion(message) {
  const text = normalizeText(message);

  return /ارخص|الاقل سعرا|اقل سعر|cheap|cheapest|lowest price/.test(text);
}

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

function formatProductAnswer(product) {
  const currency = product.currency_code || "EGP";
  const discounted = hasDiscount(product);

  let answer = `**${cleanText(product.name)}**\n\n`;

  if (discounted) {
    const saved = Number(product.regular_price) - Number(product.price);
    const percent = product.discount_percent ||
      Math.round(saved / Number(product.regular_price) * 100);

    answer +=
      `السعر قبل الخصم: ${formatMoney(product.regular_price, currency)}\n` +
      `السعر بعد الخصم: ${formatMoney(product.price, currency)}\n` +
      `الخصم: ${percent}%\n` +
      `وفرت: ${formatMoney(saved, currency)}\n\n`;
  } else {
    answer += `السعر الحالي: ${formatMoney(product.price, currency)}\n\n`;
  }

  answer += `الحالة: ${product.is_in_stock ? "متوفر حاليًا" : "غير متوفر حاليًا"}`;

  if (product.permalink) {
    answer += `\n\nرابط المنتج: ${product.permalink}`;
  }

  return answer;
}

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

    const brain = await think({
      message: question,
      history: [],
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

    // ======================================
    // DIRECT: CHEAPEST PRODUCT
    // ======================================

    if (isCheapestQuestion(question)) {
      if (!products.length) {
        products = await getProducts();
      }

      const available = products
        .filter(product =>
          product.is_in_stock === true &&
          product.price != null &&
          Number.isFinite(Number(product.price)) &&
          Number(product.price) > 0
        )
        .sort((a, b) => Number(a.price) - Number(b.price));

      if (!available.length) {
        return res.status(200).json({
          success: true,
          answer: "مش قادر أحدد أرخص منتج متاح حاليًا.",
          sessionId: currentSessionId,
          intent: "products"
        });
      }

      const cheapest = available[0];

      const answer =
        `أرخص منتج متاح عندنا حاليًا هو:\n\n` +
        formatProductAnswer(cheapest);

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
    // PRODUCT SEARCH
    // ======================================

    const rankedProducts = findMatchingProducts(question, products);
    const matchedProducts = selectBestMatches(rankedProducts);

    if (
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
    // GEMINI
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

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;

    if (!apiKey || !model) {
      throw new Error("Gemini configuration is missing.");
    }

    const prompt = `
أنت Ask Logvidia، وكيل ذكاء اصطناعي متخصص في خدمة عملاء متجر Logvidia.

افهم العربية المصرية والفصحى والإنجليزية وأخطاء الكتابة.
استخدم بيانات المنتجات الحقيقية فقط.

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

بيانات المنتجات:
${JSON.stringify(catalog)}

رسالة العميل:
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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1800
          }
        }),
        signal: AbortSignal.timeout(8000)
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
      intent: brain.intent
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
