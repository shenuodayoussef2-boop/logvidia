
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

function formatProduct(product, index) {
  const price = product.price != null
    ? `${product.price} ${product.currency_code || "EGP"}`
    : "السعر غير محدد";

  return (
    `${index + 1}. ${cleanText(product.name)}\n` +
    `السعر: ${price}\n` +
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

    // لا نثق في أي role يرسله المتصفح.
    // المحادثة العامة حاليًا تعمل بصلاحيات الزبون فقط.
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

    const products =
      brain.context?.storeKnowledge?.products || [];

    if (!Array.isArray(products)) {
      throw new Error("Invalid store knowledge.");
    }

    // عرض المنتجات المتاحة مباشرة من قاعدة البيانات.
    if (isAllProductsQuestion(question)) {
      const availableProducts = products.filter(
        product => product.is_in_stock === true
      );

      const answer = availableProducts.length
        ? (
            `أهلًا بك في Logvidia!\n` +
            `دي المنتجات المتاحة حاليًا (${availableProducts.length} منتج):\n\n` +
            availableProducts
              .map(formatProduct)
              .join("\n\n")
          )
        : "لا توجد منتجات متاحة حاليًا في المتجر.";

      await saveChat(
        currentSessionId,
        question,
        answer
      );

      return res.status(200).json({
        success: true,
        answer,
        sessionId: currentSessionId,
        intent: brain.intent
      });
    }

    // تجهيز معرفة المتجر للعقل اللغوي.
    const catalog = products.map(product => ({
      id: product.woo_id,
      name: cleanText(product.name),
      description: cleanText(product.description || ""),
      price: product.price,
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

أنت لست مجرد بوت يعرض المنتجات.
أنت مساعد ذكي يفهم نية العميل، ويحلل طلبه، ويستخدم معلومات المتجر للإجابة بدقة.

مهمتك:
- فهم العربية المصرية والعربية الفصحى والإنجليزية.
- فهم اختلاف كتابة أسماء المنتجات والأخطاء الإملائية قدر الإمكان.
- فهم الأسئلة المختصرة اعتمادًا على سياق المحادثة المتاح.
- البحث في أسماء المنتجات وأوصافها.
- مقارنة المنتجات وترشيح الأنسب حسب احتياج العميل.
- شرح الفروق بين المنتجات بطريقة بسيطة.
- ذكر السعر والتوفر كما وردا في بيانات المتجر.
- إضافة رابط المنتج إذا كان موجودًا.

قواعد أساسية:
1. أجب عن السؤال مباشرة.
2. لا تكرر تعريف نفسك في كل رد.
3. لا تخترع منتجات أو أسعارًا أو مواصفات أو مخزونًا.
4. لا تفترض أن المنتج متوفر إذا كانت بياناته تقول غير ذلك.
5. إذا لم تفهم كلمة أو طلبًا، اسأل سؤالًا توضيحيًا.
6. إذا لم تجد المنتج، وضّح ذلك ولا تخترع نتيجة.
7. إذا طلب العميل مقارنة، قارن كل المنتجات المناسبة الموجودة في البيانات.
8. لا تدّعِ أنك نفذت شراءً أو تعديلًا أو حجزًا.
9. لا تكشف بيانات العملاء أو الفواتير أو المعلومات الإدارية.
10. لا تدّعِ امتلاك صلاحيات صاحب المتجر.
11. أجب بلغة العميل وبأسلوب طبيعي وودود.
12. لا تعرض معلومات تقنية أو JSON.

نوع الطلب الذي حلله النظام:
${brain.intent}

بيانات المنتجات الحقيقية:
${JSON.stringify(catalog)}

رسالة العميل:
${question}

اكتب أفضل إجابة ممكنة اعتمادًا على البيانات المتاحة.
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
              parts: [{ text: prompt }]
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

    await saveChat(
      currentSessionId,
      question,
      answer
    );

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
