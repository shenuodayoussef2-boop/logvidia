
const FOLLOW_UP_PATTERNS = [
  "ده",
  "دي",
  "دول",
  "منه",
  "منها",
  "عليه",
  "عليها",
  "اللي فات",
  "السابق",
  "نفسه",
  "نفسها",
  "طب",
  "طيب",
  "وكمان",
  "what about it",
  "that one",
  "this one",
  "the previous one",
  "and this",
  "it",
  "them"
];

const NEW_TOPIC_PATTERNS = [
  "موضوع تاني",
  "سؤال تاني",
  "حاجه تانيه",
  "منتج مختلف",
  "بالمناسبه",
  "another question",
  "different topic",
  "new topic"
];

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function getLastMessage(history = [], role = null) {
  if (!Array.isArray(history)) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];

    if (
      item &&
      (!role || item.role === role) &&
      typeof item.content === "string"
    ) {
      return item.content;
    }
  }

  return null;
}

function getRecentMessages(history = [], limit = 8) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string"
    )
    .slice(-limit)
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 2000)
    }));
}

function detectFollowUp(message = "") {
  const text = normalize(message);

  return FOLLOW_UP_PATTERNS.some(pattern =>
    text.includes(normalize(pattern))
  );
}

function detectNewTopic(message = "") {
  const text = normalize(message);

  return NEW_TOPIC_PATTERNS.some(pattern =>
    text.includes(normalize(pattern))
  );
}

function extractLastProduct(history = []) {
  const assistantMessages = history
    .filter(item =>
      item &&
      item.role === "assistant" &&
      typeof item.content === "string"
    )
    .reverse();

  for (const item of assistantMessages) {
    const match = item.content.match(
      /\*\*([^*\n]{2,120})\*\*/
    );

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function analyzeConversationContext({
  message = "",
  history = []
} = {}) {
  const recentMessages = getRecentMessages(history);

  const previousUserMessage = getLastMessage(
    recentMessages,
    "user"
  );

  const previousAssistantMessage = getLastMessage(
    recentMessages,
    "assistant"
  );

  const isNewTopic = detectNewTopic(message);

  const isFollowUp =
    !isNewTopic &&
    recentMessages.length > 0 &&
    (
      detectFollowUp(message) ||
      normalize(message).split(/\s+/).length <= 4
    );

  const lastProduct = isNewTopic
    ? null
    : extractLastProduct(recentMessages);

  return {
    isFollowUp,
    isNewTopic,
    previousUserMessage,
    previousAssistantMessage,
    lastProduct,
    recentMessages,
    contextInstruction: isFollowUp
      ? "قد يكون السؤال متابعة للمحادثة السابقة. افهم مرجع الكلمات من السياق قبل الرد."
      : isNewTopic
        ? "العميل بدأ موضوعًا جديدًا. لا تربط السؤال بالموضوع السابق."
        : "افهم السؤال الحالي أولًا، واستخدم السياق السابق عند الحاجة فقط."
  };
}

module.exports = {
  normalize,
  getLastMessage,
  getRecentMessages,
  detectFollowUp,
  detectNewTopic,
  extractLastProduct,
  analyzeConversationContext
};
