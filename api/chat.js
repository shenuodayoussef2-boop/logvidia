
const { getProducts, supabaseRequest } = require("./_lib");
const crypto = require("crypto");

// تنظيف النصوص من HTML
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

// توحيد النصوص لتسهيل البحث
function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// تحديد طلب عرض جميع المنتجات
function isAllProductsQuestion(message) {
  const text = normalizeText(message);

  const mentionsProducts =
    /(?:المنتجات|منتجات|product|products)/.test(text);

  const asksForAll =
    /(?:كل|جميع|ما|ايه|اي|اعرض|وريني|المتاحه|المتوفره|الموجوده|عندكم|available|all|show|list)/.test(text);

  return mentionsProducts && asksForAll;
}

// تحديد السؤال عن Absolut Repair
function isAbsolutQuestion(message) {
  const text = normalizeText(message);

  const keywords = [
    "absolut",
    "absolute",
    "ابسلوت",
    "ابسلويت",
    "ابسولوت",
    "ابسوليت",
    "ابسلوت ريبير",
    "ابسولوت ريبير",
    "ابسلويت ريبير",
    "ابسو لوت"
  ];

  return keywords.some(keyword =>
    text.includes(normalizeText(keyword))
  );
}

// البحث عن منتجات Absolut Repair
function findAbsolutProducts(products) {
  return products.filter(product => {
    const content = normalizeText(
      `${product.name} ${product.description || ""}`
    );

    return (
      content.includes("absolut") ||
      content.includes("absolute")
    );
  });
}

// إنشاء رقم الجلسة
function getSessionId(sessionId) {
  if (
    typeof sessionId === "string" &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
  ) {
    return sessionId;
  }

  return "session-" + crypto.randomUUID();
}

// حفظ المحادثة
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

// تنسيق منتج واحد
function formatProduct(product, index) {
  const name = cleanText(product.name);
  const price = product.price != null
    ? `${product.price} ${product.currency_code || "EGP"}`
    : "السعر غير محدد";

  const stock = product.is_in_stock
    ? "متوفر"
    : "غير متوفر حاليًا";

  return (
    `${index + 1}. ${name}\n` +
    `السعر: ${price}\n` +
    `الحالة: ${stock}\n` +
    `رابط المنتج: ${product.permalink || "غير متاح"}`
  );
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

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
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

    // إعداد Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;

    if (!apiKey || !model) {
      throw new Error(
        "Gemini environment variables are missing."
      );
    }

    // تحميل المنتجات من Supabase
    const products = await getProducts();

    if (!Array.isArray(products)) {
      throw new Error("Products data is invalid.");
    }

    // =====================================
    // الحالة الأولى: العميل يسأل عن كل المنتجات
    // =====================================

    if (isAllProductsQuestion(question)) {

      const availableProducts = products.filter(
        product => product.is_in_stock === true
      );

      let answer;

      if (availableProducts.length > 0) {
        answer =
          `أهلًا بك في Logvidia!\n` +
          `دي قائمة المنتجات المتاحة حاليًا (${availableProducts.length} منتج):\n\n` +
          availableProducts
            .map((product, index) =>
              formatProduct(product, index)
            )
            .join("\n\n");
      } else {
        answer =
          "لا توجد منتجات متاحة حاليًا في المتجر.";
      }

      await saveChat(
        currentSessionId,
        question,
        answer
      );

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId
      });
    }

    // =====================================
    // الحالة الثانية: البحث عن Absolut Repair
    // =====================================

    const absolutQuestion = isAbsolutQuestion(question);

    const relevantProducts = absolutQuestion
      ? findAbsolutProducts(products)
      : products;

    const catalog = relevantProducts.map(product => ({
      id: product.woo_id,
      name: cleanText(product.name),
      description: cleanText(product.description || ""),
      price: product.price,
      currency: product.currency_code || "EGP",
      inStock: product.is_in_stock,
      url: product.permalink
    }));

    if (absolutQuestion && catalog.length === 0) {
      const answer =
        "لم أجد منتجات Absolut Repair ضمن المنتجات الموجودة في المتجر حاليًا.";

      await saveChat(
        currentSessionId,
        question,
        answer
      );

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId
      });
    }

    // =====================================
    // تعليمات Gemini
    // =====================================

    const prompt = `
أنت Ask Logvidia، مساعد التسوق الذكي لمتجر Logvidia.

مهمتك:
مساعدة العملاء في البحث عن المنتجات ومعرفة الأسعار والتوفر والمقارنة بينها.

قواعد الإجابة:

1. أجب عن سؤال العميل مباشرة.
2. لا تكرر تعريف نفسك في كل إجابة.
3. لا تقل "أنا مساعد المتجر الذكي" إذا كان العميل يسأل عن منتج.
4. افهم أسماء المنتجات بالعربية والإنجليزية حتى لو كانت مكتوبة بتهجئة غير دقيقة.
5. ابحث في أسماء المنتجات وأوصافها.
6. اعرض جميع المنتجات المطابقة لسؤال العميل، وليس منتجًا واحدًا فقط.
7. إذا طلب العميل المقارنة، قارن بين المنتجات المتاحة.
8. اذكر السعر وحالة المخزون كما وردا في البيانات.
9. أضف رابط المنتج عند توفره.
10. لا تخترع منتجات أو أسعارًا أو معلومات.
11. إذا لم تجد منتجًا مطابقًا، أخبر العميل بوضوح.
12. أجب بلغة العميل.
13. استخدم أسلوبًا مصريًا طبيعيًا وودودًا.
14. لا تستخدم Markdown أو علامات النجمتين.
15. لا تعرض بيانات JSON أو معلومات تقنية للعميل.
16. لا تدّعِ أنك نفذت عملية شراء أو تعديل طلب.
17. إذا سأل العميل عن Absolut Repair، اعرض كل المنتجات المطابقة الموجودة في البيانات.

بيانات المنتجات:

${JSON.stringify(catalog, null, 2)}

سؤال العميل:

${question}

أجب مباشرة عن السؤال بالاعتماد على بيانات المتجر فقط.
`;

    // =====================================
    // الاتصال بـ Gemini
    // =====================================

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
                {
                  text: prompt
                }
              ]
            }
          ],
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
      console.error(
        "Gemini error:",
        response.status,
        result
      );

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
      throw new Error(
        "Gemini returned an empty response."
      );
    }

    // حفظ المحادثة
    await saveChat(
      currentSessionId,
      question,
      answer
    );

    // إرسال الرد
    return res.status(200).json({
      success: true,
      answer,
      sessionId: currentSessionId
    });

  } catch (error) {
    console.error(
      "Chat API error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء معالجة سؤالك."
    });
  }
};
