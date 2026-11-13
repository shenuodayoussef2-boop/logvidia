
const { supabaseRequest } = require("./_lib");
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

function findMatchingProducts(message, products) {
  const text = normalizeText(message);

  const words = text
    .split(/\s+/)
    .filter(word => word.length >= 2);

  const ignored = new Set([
    "بكام", "كام", "سعر", "اسعار", "عندكم", "عاوز",
    "عايز", "محتاج", "موجود", "متاح", "المنتج",
    "منتج", "المنتجات", "لو", "سمحت", "من", "في",
    "على", "قبل", "بعد", "الخصم", "خصم", "تخفيض",
    "تخفيضات", "عروض", "عرض", "عندكو", "ممكن",
    "ايه", "هو", "هي", "the", "price", "how",
    "much", "is", "what", "discount", "sale"
  ]);

  const searchWords = words.filter(word => !ignored.has(word));

  if (!searchWords.length) return [];

  return products
    .map(product => {
      const name = normalizeText(cleanText(product.name));
      const description = normalizeText(cleanText(product.description || ""));

      let score = 0;

      for (const word of searchWords) {
        if (name.includes(word)) score += word.length >= 5 ? 4 : 2;
        else if (description.includes(word)) score += 1;
      }

      return { product, score };
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
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

    const products = brain.context?.storeKnowledge?.products || [];

    if (!Array.isArray(products)) {
      throw new Error("Invalid store knowledge.");
    }

    // عرض جميع المنتجات مع أسعارها وخصوماتها.
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

    // إجابة مباشرة عن سعر المنتج أو التخفيض من قاعدة البيانات.
    const matchedProducts = findMatchingProducts(question, products);

    if (
      matchedProducts.length > 0 &&
      (
        isDiscountQuestion(question) ||
        /(?:بكام|كام|سعر|اسعار|price|how much)/.test(normalizeText(question))
      )
    ) {
      const answer = matchedProducts.length === 1
        ? formatProductAnswer(matchedProducts[0])
        : (
            "لقيت المنتجات دي الأقرب لسؤالك:\n\n" +
            matchedProducts.map(formatProduct).join("\n\n")
          );

      await saveChat(currentSessionId, question, answer);

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: brain.intent
      });
    }

    // تجهيز بيانات المتجر لـ Gemini.
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
        signal: AbortSignal.timeout(30000)
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

    return res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء معالجة سؤالك."
    });
  }
};
