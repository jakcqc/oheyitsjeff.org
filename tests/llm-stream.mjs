/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { streamedAssistantMessage } from "../helper/llmStream.js";

test("reply text grows while its enclosing JSON remains incomplete", () => {
  assert.equal(streamedAssistantMessage('{"mess'), "");
  assert.equal(streamedAssistantMessage('{"message":"Setting'), "Setting");
  assert.equal(streamedAssistantMessage('{"message":"Setting amount to 35.","actions":['), "Setting amount to 35.");
});

test("split escapes and Unicode become readable text without exposing JSON syntax", () => {
  const message = 'Set "size".\nC:\\visuals\t\u263a\uD83D\uDE00';
  const response = JSON.stringify({ message, actions: [] });
  let previous = "";
  for (let i = 1; i <= response.length; i++) {
    const preview = streamedAssistantMessage(response.slice(0, i));
    assert.ok(message.startsWith(preview), `Unexpected preview at ${i}: ${preview}`);
    assert.ok(preview.startsWith(previous), `Preview moved backward at ${i}`);
    previous = preview;
  }
  assert.equal(previous, message);
});

test("only the top-level message is previewed, including after the actions array", () => {
  assert.equal(streamedAssistantMessage('{"actions":[{"message":"ignore me","label":"message"}],"message":"Done'), "Done");
  assert.equal(streamedAssistantMessage('{"actions":[{"message":"ignore me"}]}'), "");
  assert.equal(streamedAssistantMessage('<think>reasoning</think>{"message":"No"}'), "");
  assert.equal(streamedAssistantMessage('[{"message":"No"}]'), "");
  assert.equal(streamedAssistantMessage('{"message":null}'), "");
  assert.equal(streamedAssistantMessage('{"message":"bad\\q'), "");
});

test("Unicode escape sequences wait for all digits and complete surrogate pairs", () => {
  const response = '{"message":"Hi \\u263a \\ud83d\\ude00","actions":[]}';
  let previous = "";
  for (let i = 1; i <= response.length; i++) {
    const preview = streamedAssistantMessage(response.slice(0, i));
    assert.ok("Hi ☺ 😀".startsWith(preview));
    assert.ok(preview.startsWith(previous));
    assert.ok(!/[\uD800-\uDBFF]$/.test(preview));
    previous = preview;
  }
  assert.equal(previous, "Hi ☺ 😀");
});

test("HTML-like reply text remains literal text for the UI's textContent", () => {
  assert.equal(streamedAssistantMessage('{"message":"<strong>size</strong>'), "<strong>size</strong>");
});
