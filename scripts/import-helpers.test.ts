import { describe, it, expect } from "vitest";
import { parseFilename, parseFolder, sqlEscape } from "./import-helpers";

describe("import helpers", () => {
  it("derives title from exported filename", () => {
    expect(parseFilename("adding_new_coupon-1781276151706.html").title).toBe("Adding New Coupon");
  });

  it("collapses repeated underscores in slug", () => {
    expect(parseFilename("how_to_set_promo_price___promo_period-1781276151710.html").slug).toBe(
      "how-to-set-promo-price-promo-period",
    );
  });

  it("handles parenthesized words", () => {
    expect(parseFilename("insert_product_data___regular_price__rm_-1781276151774.html").title).toBe(
      "Insert Product Data Regular Price Rm",
    );
  });

  it("splits emoji from folder name", () => {
    expect(parseFolder("♠️  WooCommerce")).toEqual({ emoji: "♠️", name: "WooCommerce" });
    expect(parseFolder("🛠  Product SEO")).toEqual({ emoji: "🛠", name: "Product SEO" });
    expect(parseFolder("Live Chat")).toEqual({ emoji: "", name: "Live Chat" });
  });

  it("escapes single quotes for SQL", () => {
    expect(sqlEscape("it's")).toBe("it''s");
  });
});
