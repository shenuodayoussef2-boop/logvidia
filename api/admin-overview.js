
const { requireAdmin } = require("./_admin");
const { getProducts } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // السماح بطلبات القراءة فقط
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed."
    });
  }

  // التحقق من جلسة المدير
  if (!requireAdmin(req, res)) {
    return;
  }

  try {
    // قراءة عدد المنتجات المسجلة في قاعدة البيانات
    const products = await getProducts();

    return res.status(200).json({
      ok: true,
      overview: {
        products: Array.isArray(products) ? products.length : 0,
        adminAuthenticated: true,
        databaseConnected: true,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Admin overview error:", error);

    return res.status(500).json({
      ok: false,
      message: "تعذر تحميل بيانات لوحة الإدارة."
    });
  }
};
