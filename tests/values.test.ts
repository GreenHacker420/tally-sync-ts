import test from "node:test";
import assert from "node:assert/strict";
import {
  tallyText,
  tallyNumber,
  tallyBoolean,
  tallyLogical,
  parseQuantity,
  parseRate,
  parseAmount,
  formatDateForTally,
  getSingleValue,
  REGEX_CONTROL_CHAR,
  REGEX_COMMA,
  REGEX_NOT_APPLICABLE,
  REGEX_DATE_DELIMITER,
  REGEX_QUANTITY,
  REGEX_RATE,
  COMMON_REGEX,
} from "../src/xml/values.js";

test("XML Values - Common Regex Constants", () => {
  assert.ok(REGEX_CONTROL_CHAR instanceof RegExp);
  assert.ok(REGEX_COMMA instanceof RegExp);
  assert.ok(REGEX_NOT_APPLICABLE instanceof RegExp);
  assert.ok(REGEX_DATE_DELIMITER instanceof RegExp);
  assert.ok(REGEX_QUANTITY instanceof RegExp);
  assert.ok(REGEX_RATE instanceof RegExp);
  assert.equal(COMMON_REGEX.QUANTITY, REGEX_QUANTITY);
  assert.equal(COMMON_REGEX.RATE, REGEX_RATE);
});

test("XML Values - getSingleValue & tallyText", () => {
  assert.equal(getSingleValue(undefined), undefined);
  assert.equal(getSingleValue(null), undefined);
  assert.equal(getSingleValue(["first", "second"]), "first");
  assert.equal(getSingleValue({ "#text": "hello" }), "hello");
  assert.equal(getSingleValue("direct"), "direct");

  assert.equal(tallyText(undefined), undefined);
  assert.equal(tallyText(null), undefined);
  assert.equal(tallyText("   "), undefined);
  assert.equal(tallyText("  Hello\u0004World  "), "HelloWorld");
  assert.equal(tallyText({ "#text": " Clean " }), "Clean");
});

test("XML Values - tallyNumber", () => {
  assert.equal(tallyNumber(undefined), undefined);
  assert.equal(tallyNumber(""), undefined);
  assert.equal(tallyNumber("abc"), undefined);
  assert.equal(tallyNumber("1,234.56"), 1234.56);
  assert.equal(tallyNumber("-5,000"), -5000);
  assert.equal(tallyNumber("+42"), 42);
});

test("XML Values - tallyBoolean & tallyLogical", () => {
  assert.equal(tallyBoolean("Yes"), true);
  assert.equal(tallyBoolean("true"), true);
  assert.equal(tallyBoolean("1"), true);
  assert.equal(tallyBoolean("No"), false);
  assert.equal(tallyBoolean("FALSE"), false);
  assert.equal(tallyBoolean("0"), false);
  assert.equal(tallyBoolean("maybe"), undefined);

  assert.equal(tallyLogical(undefined), undefined);
  assert.equal(tallyLogical("Not Applicable"), "Not Applicable");
  assert.equal(tallyLogical("not applicable"), "Not Applicable");
  assert.equal(tallyLogical("yes"), true);
  assert.equal(tallyLogical("no"), false);
  assert.equal(tallyLogical("other"), undefined);
});

test("XML Values - parseQuantity", () => {
  assert.equal(parseQuantity(undefined), undefined);
  assert.equal(parseQuantity(""), undefined);

  const q1 = parseQuantity("100 Nos");
  assert.deepEqual(q1, { value: 100, unit: "Nos", raw: "100 Nos" });

  const q2 = parseQuantity("-12.50 kg");
  assert.deepEqual(q2, { value: -12.5, unit: "kg", raw: "-12.50 kg" });

  const q3 = parseQuantity("50");
  assert.deepEqual(q3, { value: 50, unit: undefined, raw: "50" });

  const qInvalid = parseQuantity("invalid");
  assert.ok(Number.isNaN(qInvalid?.value));
  assert.equal(qInvalid?.raw, "invalid");
});

test("XML Values - parseRate", () => {
  assert.equal(parseRate(undefined), undefined);
  assert.equal(parseRate(""), undefined);

  const r1 = parseRate("50/box");
  assert.deepEqual(r1, { value: 50, unit: "box", raw: "50/box" });

  const r2 = parseRate("-12.5/kg");
  assert.deepEqual(r2, { value: -12.5, unit: "kg", raw: "-12.5/kg" });

  const r3 = parseRate("100");
  assert.deepEqual(r3, { value: 100, unit: undefined, raw: "100" });

  const r4 = parseRate("1,000");
  assert.deepEqual(r4, { value: 1000, raw: "1,000" });
});

test("XML Values - parseAmount", () => {
  assert.equal(parseAmount(undefined), undefined);
  assert.equal(parseAmount(""), undefined);

  const a1 = parseAmount("1,250.75");
  assert.deepEqual(a1, { value: 1250.75, raw: "1,250.75" });

  const a2 = parseAmount("-500");
  assert.deepEqual(a2, { value: -500, raw: "-500" });
});

test("XML Values - formatDateForTally", () => {
  assert.equal(formatDateForTally(undefined), "");
  assert.equal(formatDateForTally("20240315"), "20240315");
  assert.equal(formatDateForTally("2024-03-15"), "20240315");
  assert.equal(formatDateForTally("2024/03/15"), "20240315");
  assert.equal(formatDateForTally(new Date(2024, 2, 15)), "20240315");
});
