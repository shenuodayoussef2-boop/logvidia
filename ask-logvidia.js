
(() => {
  const db = window.LOGVIDIA_DEMO_DB;
  if (!db) return;

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
      line-height:1.7;font-size:14px;white-space:pre-wrap;
    }
    .ask-bot {background:white;border:1px solid #e5e7eb;margin-left:25px}
    .ask-user {background:#111827;color:white;margin-right:25px}
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
      <input id="ask-logvidia-input" placeholder="اسأل عن منتج أو سعر..." autocomplete="off">
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

  function answer(question) {
    const q = question.toLowerCase().trim();

    if (/مرحبا|اهلا|السلام عليكم|hello|hi/.test(q)) {
      return "أهلًا بك في Logvidia! 👋 اسألني عن المنتجات والأسعار.";
    }

    if (/شحن|توصيل|طلب|دفع|اوردر/.test(q)) {
      return "هذه نسخة تجريبية. معلومات الشحن والطلبات والدفع غير مفعّلة حاليًا.";
    }

    const matches = db.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      q.split(/\s+/).filter(Boolean).some(word =>
        word.length > 2 && p.name.toLowerCase().includes(word)
      )
    );

    if (matches.length) {
      return matches.slice(0, 5).map(p =>
        `🛍️ ${p.name}\n💰 ${p.price} ${db.currency}\n📦 ${p.stock}`
      ).join("\n\n");
    }

    if (/منتج|منتجات|كل المنتجات/.test(q)) {
      return db.products.map(p =>
        `• ${p.name} — ${p.price} ${db.currency}`
      ).join("\n");
    }

    return "لم أجد منتجًا مطابقًا في قاعدة البيانات التجريبية. جرّب كتابة اسم المنتج.";
  }

  button.addEventListener("click", () => {
    panel.style.display = "block";
    if (!messages.children.length) {
      addMessage("أهلًا بك! أنا Ask Logvidia 👋\nأقدر أساعدك في البحث عن المنتجات ومعرفة أسعارها.\n\nملاحظة: هذه نسخة تجريبية.");
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
