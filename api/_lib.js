
const STORE_URL = process.env.STORE_URL || "https://store.logvidia.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
}

async function supabaseRequest(path, options = {}) {
  checkConfig();

  const response = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...options.headers
      },
      signal: AbortSignal.timeout(20000)
    }
  );

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}: ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

async function fetchWooProducts() {
  const products = [];
  const base = STORE_URL.replace(/\/$/, "");

  for (let page = 1; page <= 5; page++) {
    const url = new URL(
      `${base}/wp-json/wc/store/v1/products`
    );

    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`WooCommerce error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) break;

    products.push(...data);

    if (data.length < 100) break;
  }

  return products.map(product => {
    const prices = product.prices || {};
    const minorUnit = Number(prices.currency_minor_unit ?? 2);

    return {
      woo_id: product.id,
      name: product.name || "Unnamed product",
      slug: product.slug || null,
      permalink: product.permalink || null,
      description: product.short_description ||
                   product.description || "",
      image_url: product.images?.[0]?.src || null,
      price: prices.price != null
        ? Number(prices.price) / Math.pow(10, minorUnit)
        : null,
      currency_code: prices.currency_code || "EGP",
      is_in_stock: Boolean(product.is_in_stock),
      updated_at: new Date().toISOString()
    };
  });
}

async function syncProducts() {
  const products = await fetchWooProducts();

  if (!products.length) {
    return { synced: 0 };
  }

  await supabaseRequest(
    "products?on_conflict=woo_id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(products)
    }
  );

  return { synced: products.length };
}

async function getProducts() {
  return await supabaseRequest(
    "products?select=woo_id,name,slug,permalink,description,image_url,price,currency_code,is_in_stock&order=name.asc",
    { method: "GET" }
  );
}

module.exports = {
  supabaseRequest,
  fetchWooProducts,
  syncProducts,
  getProducts
};
