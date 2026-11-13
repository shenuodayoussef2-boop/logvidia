
const { syncProducts, getProducts } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    // مزامنة المنتجات مع المتجر
    const sync = await syncProducts();

    // قراءة المنتجات من قاعدة البيانات
    const products = await getProducts();

    return res.status(200).json({
      success: true,
      source: "Logvidia WooCommerce + Supabase",
      synced: sync.synced,
      total: products.length,
      products
    });

  } catch (error) {
    console.error("Products API error:", error.message);

    return res.status(500).json({
      success: false,
      error: "تعذر تحميل المنتجات حاليًا."
    });
  }
};
