import test from "node:test";
import assert from "node:assert/strict";
import { TALLY_CATALOG_TAGS_COUNT } from "../src/schema/catalog/tallyTagsCatalog.js";
import { TallyReader } from "../src/xml/reader.js";

test("808 Tally XML Tags Catalog Coverage", () => {
  assert.equal(TALLY_CATALOG_TAGS_COUNT, 808, "Catalog must contain exactly 808 discovered tags");

  // Verify TallyReader O(1) uppercase lookup with sample catalog tags
  const sampleNode = {
    BASICBUYERNAME: "Test Buyer",
    CLOSINGBALANCE: "240 PCS",
    ISDEEMEDPOSITIVE: "Yes",
    MSMEREGNUMBER: "UDYAM-00-1234",
    GSTRATE: "18"
  };

  const reader = new TallyReader(sampleNode);
  assert.equal(reader.text("basicbuyername"), "Test Buyer");
  assert.equal(reader.text("CLOSINGBALANCE"), "240 PCS");
  assert.equal(reader.logical("isDeemedPositive"), true);
  assert.equal(reader.text("msmeRegNumber"), "UDYAM-00-1234");
  assert.equal(reader.number("gstrate"), 18);

  const allTags = reader.getAllTags();
  assert.equal(allTags.BASICBUYERNAME, "Test Buyer");
  assert.equal(allTags.MSMEREGNUMBER, "UDYAM-00-1234");
});
