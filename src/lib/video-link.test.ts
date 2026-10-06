import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVideoUrl, videoEmbedUrl } from "./video-link.ts";

describe("parseVideoUrl", () => {
  it("reads YouTube and Vimeo addresses", () => {
    const yt = { provider: "youtube", id: "dQw4w9WgXcQ" };
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      assert.deepEqual(parseVideoUrl(url), yt, url);
    }
    const vimeo = { provider: "vimeo", id: "76979871" };
    for (const url of ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"]) {
      assert.deepEqual(parseVideoUrl(url), vimeo, url);
    }
  });

  it("rejects other hosts, lookalikes, http and addresses with no video", () => {
    for (const url of [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/",
      "https://www.youtube.com/watch?v=short",
      "https://vimeo.com/channels/staffpicks",
      "javascript:alert(1)",
      "not a url",
    ]) {
      assert.equal(parseVideoUrl(url), null, url);
    }
  });

  it("builds embed addresses", () => {
    assert.equal(videoEmbedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" }), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(videoEmbedUrl({ provider: "vimeo", id: "1" }), "https://player.vimeo.com/video/1");
  });
});
