import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tallyText } from "../src/xml/values.js";

describe("tallyText with attribute-only elements", () => {
  it("treats an empty element that carries attributes as no value (was the string '[object Object]')", () => {
    // <RESULT TYPE="String"></RESULT> parses to an object without "#text"
    assert.equal(tallyText({ "@_TYPE": "String" }), undefined);
  });
  it("still reads the text of an element that has attributes", () => {
    assert.equal(tallyText({ "@_TYPE": "String", "#text": " DEMO CO " }), "DEMO CO");
  });
});
