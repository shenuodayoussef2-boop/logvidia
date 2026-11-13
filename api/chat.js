
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
    .replace(/\s+/g, " ")
    .trim();
}

// توحيد الكتابة العربية والإنجليزية
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

// اكتشاف السؤال عن Absolut Repair
function isAbsolutQuestion(message) {
  const normalized = normalizeText(message);

  const keywords = [
    "absolut",
    "absolute",
    "ابسلوت",
    "ابسلويت",
    "ابسولوت",
    "ابسوليت",
    "ابسلويت",
    "ابسلوت ريبير",
    "ابسولوت ريبير",
    "ابسلويت ريبير",
    "ابسو لوت"
  ];

  return keywords.some(keyword =>
    normalized.includes(normalizeText(keyword))
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

    // تحديد المنتجات المتعلقة بالسؤال
    const absolutQuestion = isAbsolutQuestion(message);

    const relevantProducts = absolutQuestion
      ? findAbsolutProducts(products)
      : products;

    // تجهيز بيانات المنتجات
    const catalog = relevantProducts.map(product => ({
      id: product.woo_id,
      name: cleanText(product.name),
      description: cleanText(product.description || ""),
      price: product.price,
      currency: product.currency_code || "EGP",
      inStock: product.is_in_stock,
      url: product.permalink
    }));

    // لو السؤال عن أبسولوت ومفيش منتجات مطابقة
    if (absolutQuestion && catalog.length === 0) {
      const answer =
        "لم أجد منتجات Absolut Repair ضمن المنتجات المتاحة حاليًا في المتجر.";

      return res.status(200).json({
        success: true,
        answer,
        sessionId:
          typeof sessionId === "string"
            ? sessionId
            : "session-" + crypto.randomUUID()
      });
    }

    // تعليمات Gemini
    const prompt = `
أنت Ask Logvidia، مساعد التسوق الذكي لمتجر Logvidia.

دورك:
مساعدة العملاء في معرفة المنتجات والأسعار والتوفر والمقارنة بينها.

قواعد مهمة جدًا:

1. أجب عن سؤال العميل مباشرة ولا تكرر تعريف نفسك.
2. لا تقل "أنا مساعد المتجر الذكي" إذا كان العميل يسأل عن منتج.
3. افهم أسماء المنتجات حتى لو كتبها العميل بالعربية أو الإنجليزية أو بتهجئة غير دقيقة.
4. كلمة أبسلويت أو أبسولوت أو أبسلويت ريبير قد تشير إلى Absolut Repair.
5. ابحث في أسماء المنتجات وأوصافها.
6. اعرض المنتجات المطابقة للسؤال.
7. اذكر اسم المنتج وسعره وحالة توفره.
8. أضف رابط المنتج إذا كان متاحًا.
9. إذا كان هناك أكثر من منتج مطابق، اعرض الخيارات كلها.
10. لا تخترع منتجات أو أسعارًا أو معلومات غير موجودة.
11. إذا كان المنتج غير متوفر، وضح ذلك.
12. أجب بنفس لغة العميل.
13. استخدم أسلوبًا مصريًا طبيعيًا وودودًا.
14. لا تستخدم Markdown أو علامات النجمتين **.
15. لا تعرض بيانات تقنية أو JSON للعميل.
16. لا تدّعِ تنفيذ عملية شراء أو تعديل طلب.
17. إذا لم تجد منتجًا مطابقًا، قل ذلك بوضوح واقترح البحث عن اسم آخر.

بيانات المنتجات المتاحة:

${JSON.stringify(catalog, null, 2)}

سؤال العميل:
${message.trim()}

أجب عن سؤال العميل باستخدام المنتجات الموجودة في البيانات فقط.
`;

    // إرسال السؤال إلى Gemini
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
            maxOutputTokens: 1000
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

    // إنشاء Session ID
    const safeSessionId =
      typeof sessionId === "string" &&
      /^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
        ? sessionId
        : "session-" + crypto.randomUUID();

    // حفظ المحادثة في Supabase
    try {
      await supabaseRequest("chat_logs", {
        method: "POST",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          session_id: safeSessionId,
          question: message.trim(),
          answer
        })
      });
    } catch (logError) {
      console.error(
        "Chat logging failed:",
        logError.message
      );
    }

    // إرسال الرد للواجهة
    return res.status(200).json({
      success: true,
      answer,
      sessionId: safeSessionId
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
