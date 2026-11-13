
(() => {
  if (window.__ASK_LOGVIDIA_LOADED__) return;
  window.__ASK_LOGVIDIA_LOADED__ = true;

  const style = document.createElement("style");
  style.textContent = `
    #ask-logvidia-btn {
      position:fixed;bottom:22px;left:22px;z-index:99999;
      background:#111827;color:white;border:1px solid #374151;
      border-radius:50px;padding:14px 20px;cursor:pointer;
      font-size:15px;font-weight:bold;box-shadow:0 5px 25px #0003;
    }
    #ask-logvidia-panel {
      display:none;position:fixed;bottom:85px;left:22px;
      width:min(360px,calc(100vw - 32px));height:480px;
      max-height:70vh;z-index:99999;background:white;color:#111827;
      border-radius:18px;box-shadow:0 10px 40px #0004;
      overflow:hidden;direction:rtl;font-family:Arial,sans-serif;
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
      display:flex;align-items:center;gap:9px;
      padding:10px;border-top:1px solid #eee;background:#fff;
    }

    .ask-logvidia-brand {
      display:flex;align-items:center;gap:6px;
      white-space:nowrap;color:#111827;
      font-size:12px;font-weight:800;
    }

    .ask-logvidia-brand i {
      font-size:17px;
    }

    #ask-logvidia-input {
      flex:1;min-width:0;width:100%;
      border:1px solid #ddd;border-radius:10px;
      padding:12px 10px;font-size:13px;outline:none;
      background:#fff;
    }

    #ask-logvidia-input:focus {
      border-color:#111827;
    }

    #ask-logvidia-send {
      background:#111827;color:white;border:0;
      border-radius:10px;padding:12px 13px;cursor:pointer;
      white-space:nowrap;
    }
    #ask-logvidia-send:disabled {opacity:.5;cursor:wait}

    @media(max-width:390px) {
      .ask-logvidia-brand {font-size:10px;gap:4px}
      .ask-logvidia-brand i {font-size:15px}
      #ask-logvidia-form {gap:6px;padding:8px}
      #ask-logvidia-send {padding:12px 9px}
    }
  `;

  document.head.appendChild(style);

  const button = document.createElement("button");
  button.id = "ask-logvidia-btn";
  button.innerHTML = '<i class="fa-solid fa-robot"></i> Ask Logvidia';

  const panel = document.createElement("section");
  panel.id = "ask-logvidia-panel";

  panel.innerHTML = `
    <div id="ask-logvidia-head">
   <i class="fa-solid fa-robot"></i>
      <button id="ask-logvidia-close" aria-label="إغلاق">×</button>
    </div>

    <div id="ask-logvidia-messages"></div>

    <form id="ask-logvidia-form">
      <div class="ask-logvidia-brand">
        <i class="fa-solid fa-robot"></i>
      </div>
      <input id="ask-logvidia-input"
        placeholder="Ask Logvidia..."
        autocomplete="off" maxlength="1500">

      <button id="ask-logvidia-send" type="submit">
        <i class="fa-solid fa-paper-plane"></i>
      </button>
    </form>
  `;

  document.body.append(button, panel);

  const messages = panel.querySelector("#ask-logvidia-messages");
  const input = panel.querySelector("#ask-logvidia-input");
  const form = panel.querySelector("#ask-logvidia-form");
  const sendButton = panel.querySelector("#ask-logvidia-send");

  let sessionId = null;
  let busy = false;

  function addMessage(text, type = "bot") {
    const div = document.createElement("div");
    div.className = "ask-msg ask-" + type;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function sendQuestion(question) {
    if (busy) return;

    busy = true;
    sendButton.disabled = true;
    input.disabled = true;

    const loading = addMessage("جاري التفكير والبحث عن إجابة...", "bot");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message: question, sessionId})
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر الاتصال بالمساعد.");
      }

      sessionId = data.sessionId || sessionId;
      loading.textContent = data.answer || "لم يصل رد من المساعد.";

    } catch (error) {
      console.error("Ask Logvidia:", error);
      loading.textContent =
        "حصلت مشكلة أثناء الاتصال بالمساعد. حاول مرة أخرى.";
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  button.addEventListener("click", () => {
    panel.style.display = "block";

    if (!messages.children.length) {
      addMessage(
        "أهلًا بك في Ask Logvidia! 👋\nأنا مساعد التسوق الذكي. اسألني عن المنتجات والأسعار والمقارنة بينها."
      );
    }

    input.focus();
  });

  panel.querySelector("#ask-logvidia-close")
    .addEventListener("click", () => {
      panel.style.display = "none";
    });

  form.addEventListener("submit", event => {
    event.preventDefault();

    const question = input.value.trim();
    if (!question || busy) return;

    addMessage(question, "user");
    input.value = "";
    sendQuestion(question);
  });
})();
