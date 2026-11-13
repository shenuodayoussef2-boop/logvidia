
const { getProducts, supabaseRequest } = require("./_lib");

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

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;

    if (!apiKey || !model) {
      throw new Error("Gemini environment variables are missing.");
    }

    const products = await getProducts();

    const catalog = products.map(p => ({
      id: p.woo_id,
      name: p.name,
      price: p.price,
      currency: p.currency_code,
      inStock: p.is_in_stock,
      url: p.permalink
    }));

    const prompt = `
أنت Ask Logvidia، مساعد التسوق الذكي لمتجر Logvidia.

قواعدك:
- أجب بلغة العميل.
- اعتمد على قائمة المنتجات المرفقة فقط.
- لا تخترع أسعارًا أو منتجات أو معلومات مخزون.
- إذا لم تجد المنتج، قل ذلك بوضوح.
- ساعد العميل في البحث والمقارنة بين المنتجات.
- لا تدّعِ أنك نفذت عملية شراء أو تعديل طلب.
- الأسعار وحالة المخزون قد تتغير، ويجب التأكد منها في المتجر.

قائمة المنتجات:
${JSON.stringify(catalog)}

سؤال العميل:
${message.trim()}
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
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800
          }
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", response.status, result);
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

    const safeSessionId =
      typeof sessionId === "string" &&
      /^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
        ? sessionId
        : "session-" + crypto.randomUUID();

    // تسجيل المحادثة في قاعدة البيانات
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
      console.error("Chat logging failed:", logError.message);
    }

    return res.status(200).json({
      success: true,
      answer,
      sessionId: safeSessionId
    });

  } catch (error) {
    console.error("Chat API error:", error.message);

    return res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء معالجة سؤالك."
    });
  }
};
