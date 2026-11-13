
(() => {
  const db = window.LOGVIDIA_DEMO_DB;

  if (!db || !Array.isArray(db.products)) {
    console.error("Ask Logvidia: demo database not found.");
    return;
  }

  // توحيد الكتابة العربية والإنجليزية
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[’'`]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // أسماء بديلة للمنتجات
  const aliases = {
    1: ["لوريال", "لوريال بروفيشنال", "ماسك لوريال", "loreal"],
    2: ["فيشي", "ڤيشي", "vichy", "مزيل عرق"],
    3: ["شامبو لوريال", "شامبو لوريال بروفيشنال"],
    4: ["ماسك لوريال molecular", "ليف ان لوريال"],
    5: ["اولابليكس", "أولابليكس", "اولابلكس", "olaplex"],
    6: ["بلسم لوريال", "كونديشنر لوريال"],
    7: ["فينو", "ماسك فينو", "fino"],
    8: ["غسول فيشي", "غسول للبشرة"],
    9: ["فيديا جولد", "vidia gold"],
    10: ["لاروش", "لاروش بوزيه", "la roche posay"],
    11: ["ماسك لوريال molecular"]
  };

  const stopWords = [
    "عندكم", "هل", "ممكن", "عاوز", "عايزة", "عايز",
    "لو سمحت", "من فضلك", "بكام", "كم", "سعر", "اسعار",
    "ايه", "اي", "ما", "هو", "هي", "المنتج", "منتج",
    "المنتجات", "من", "في", "عن", "عاوزة", "محتاج",
    "محتاجه", "اريد", "عايزه", "بشتري", "اشتري"
  ];

  const categoryWords = {
    hair: ["شعر", "الشعر", "ماسك الشعر", "شامبو", "بلسم", "كيرلي"],
    skin: ["بشرة", "البشرة", "وجه", "غسول", "سيروم"],
    personal: ["شخصية", "مزيل عرق", "عرق"]
  };

  function cleanQuery(value) {
    let q = normalize(value);

    stopWords.forEach(word => {
      const w = normalize(word);
      q = q.replace(new RegExp(`(^| )${w}(?= |$)`, "g"), " ");
    });

    return q.replace(/\s+/g, " ").trim();
  }

  function getCategory(query) {
    for (const [category, words] of Object.entries(categoryWords)) {
      if (words.some(word => normalize(query).includes(normalize(word)))) {
        return category;
      }
    }
    return null;
  }

  function getMatches(question) {
    const original = normalize(question);
    const query = cleanQuery(question);
    const category = getCategory(original);

    const scored = db.products.map(product => {
      const name = normalize(product.name);
      const productAliases = (aliases[product.id] || []).map(normalize);
      const categoryName = normalize(product.category);

      let score = 0;

      if (query && name.includes(query)) score += 100;

      productAliases.forEach(alias => {
        if (query && alias.includes(query)) score += 90;
        if (query && query.includes(alias)) score += 90;

        query.split(" ").forEach(word => {
          if (word.length > 2 && alias.includes(word)) score += 25;
        });
      });

      query.split(" ").forEach(word => {
        if (word.length > 2 && name.includes(word)) score += 20;
      });

      if (category === "hair" && categoryName.includes("الشعر")) score += 30;
      if (category === "skin" && categoryName.includes("البشرة")) score += 30;
      if (category === "personal" && categoryName.includes("الشخصية")) score += 30;

      return { product, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.product);
  }

  function formatProducts(products) {
    return products.map(product =>
      `🛍️ ${product.name}\n💰 ${product.price} ${db.currency}\n📦 ${product.stock}`
    ).join("\n\n");
  }

  function answer(question) {
    const q = normalize(question);

    if (/مرحبا|اهلا|السلام عليكم|صباح الخير|مساء الخير|hello|hi/.test(q)) {
      return "أهلًا بك في Logvidia! 👋\nأنا مساعد المتجر التجريبي. اسألني عن المنتجات والأسعار.";
    }

    if (/شكرا|متشكر|تسلم/.test(q)) {
      return "العفو! ❤️ سعيد بمساعدتك.";
    }

    if (/شحن|توصيل|طلب|اوردر|دفع|استرجاع|استبدال/.test(q)) {
      return "هذه نسخة تجريبية من Ask Logvidia. معلومات الشحن والطلبات والدفع والاسترجاع غير مفعّلة حاليًا.";
    }

    if (/كل المنتجات|جميع المنتجات|اعرض المنتجات|قائمة المنتجات/.test(q)) {
      return "دي المنتجات الموجودة في قاعدة البيانات التجريبية:\n\n" +
        formatProducts(db.products);
    }

    const matches = getMatches(question);

    if (matches.length) {
      return "لقيت لك المنتجات دي 👇\n\n" + formatProducts(matches);
    }

    return "لم أجد منتجًا مطابقًا في قاعدة البيانات التجريبية. جرّب اسم منتج مثل Olaplex أو Vichy أو لوريال.";
  }

  // تصميم النافذة
  const style = document.createElement("style");
  style.textContent = `
    #ask-logvidia-btn {
      position:fixed; bottom:22px; left:22px; z-index:99999;
      background:#111827; color:white; border:1px solid #374151;
      border-radius:50px; padding:14px 20px; cursor:pointer;
      font-size:15px; font-weight:bold; box-shadow:0 5px 25px #0003;
    }
    #ask-logvidia-panel {
      display:none; position:fixed; bottom:85px; left:22px;
      width:min(360px,calc(100vw - 32px)); height:480px;
      max-height:70vh; z-index:99999; background:white; color:#111827;
      border-radius:18px; box-shadow:0 10px 40px #0004;
      overflow:hidden; direction:rtl; font-family:Arial,sans-serif;
    }
    #ask-logvidia-head {
      background:#111827;color:white;padding:17px;
      display:flex;justify-content:space-between;align-items:center;
    }
    #ask-logvidia-close {
      background:none;color:white;border:0;font-size:22px;cursor:pointer;
    }
    #ask-logvidia-messages {
      height:calc(100% - 130px);overflow:auto;padding:14px;
      background:#f8fafc;
    }
    .ask-msg {
      padding:11px 13px;margin:9px 0;border-radius:13px;
      line-height:1.8;font-size:14px;white-space:pre-wrap;
      overflow-wrap:anywhere;
    }
    .ask-bot {background:white;border:1px solid #e5e7eb;margin-left:20px}
    .ask-user {background:#111827;color:white;margin-right:20px}
    #ask-logvidia-form {
      display:flex;gap:7px;padding:10px;border-top:1px solid #eee;
    }
    #ask-logvidia-input {
      flex:1;min-width:0;border:1px solid #ddd;border-radius:10px;
      padding:12px;font-size:14px;outline:none;
    }
    #ask-logvidia-send {
      background:#111827;color:white;border:0;border-radius:10px;
      padding:0 17px;cursor:pointer;
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.id = "ask-logvidia-btn";
  button.textContent = "🤖 Ask Logvidia";

  const panel = document.createElement("section");
  panel.id = "ask-logvidia-panel";
  panel.innerHTML = `
    <div id="ask-logvidia-head">
      <strong>🤖 Ask Logvidia</strong>
      <button id="ask-logvidia-close" aria-label="إغلاق">×</button>
    </div>
    <div id="ask-logvidia-messages"></div>
    <form id="ask-logvidia-form">
      <input id="ask-logvidia-input"
        placeholder="اسأل عن منتج أو سعر..."
        autocomplete="off">
      <button id="ask-logvidia-send" type="submit">إرسال</button>
    </form>
  `;

  document.body.append(button, panel);

  const messages = panel.querySelector("#ask-logvidia-messages");
  const input = panel.querySelector("#ask-logvidia-input");

  function addMessage(text, type = "bot") {
    const div = document.createElement("div");
    div.className = "ask-msg ask-" + type;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  button.addEventListener("click", () => {
    panel.style.display = "block";

    if (!messages.children.length) {
      addMessage(
        "أهلًا بك! أنا Ask Logvidia 👋\nأقدر أساعدك في البحث عن المنتجات ومعرفة أسعارها.\n\nملاحظة: هذه نسخة تجريبية ببيانات غير مباشرة."
      );
    }

    input.focus();
  });

  panel.querySelector("#ask-logvidia-close").addEventListener("click", () => {
    panel.style.display = "none";
  });

  panel.querySelector("#ask-logvidia-form").addEventListener("submit", event => {
    event.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    addMessage(question, "user");
    input.value = "";
    addMessage(answer(question));
  });
})();
