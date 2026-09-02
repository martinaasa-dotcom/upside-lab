import { describe, expect, it } from "vitest";
import { AVATAR_HOSTS, avatarImgSources, safeAvatarUrl } from "@/lib/avatar-url";
import { buildContentSecurityPolicy } from "@/lib/security-headers";

describe("safeAvatarUrl", () => {
  it("takes the photo host Google hands back", () => {
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(
      "https://lh3.googleusercontent.com/a/abc=s96-c"
    );
  });

  it("takes a link from the photo service, on either spelling", () => {
    expect(safeAvatarUrl("https://gravatar.com/avatar/abc")).toBe(
      "https://gravatar.com/avatar/abc"
    );
    expect(safeAvatarUrl("https://www.gravatar.com/avatar/abc")).toBe(
      "https://www.gravatar.com/avatar/abc"
    );
  });

  it("refuses a server the member runs, which is the whole point", () => {
    expect(safeAvatarUrl("https://tracker.example.com/me.png")).toBeNull();
  });

  it("is not fooled by an allowed host inside another name", () => {
    expect(safeAvatarUrl("https://gravatar.com.evil.example/a.png")).toBeNull();
    expect(safeAvatarUrl("https://notgravatar.com/a.png")).toBeNull();
    expect(safeAvatarUrl("https://evil.example/?x=gravatar.com")).toBeNull();
  });

  it("refuses anything that is not plain https", () => {
    expect(safeAvatarUrl("http://gravatar.com/avatar/abc")).toBeNull();
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeAvatarUrl("https://user:pw@gravatar.com/a.png")).toBeNull();
    expect(safeAvatarUrl("//gravatar.com/a.png")).toBeNull();
    expect(safeAvatarUrl("")).toBeNull();
    expect(safeAvatarUrl(null)).toBeNull();
  });
});

describe("the content policy and the check agree", () => {
  it("names both spellings of every allowed host", () => {
    const sources = avatarImgSources();
    for (const host of AVATAR_HOSTS) {
      expect(sources).toContain(`https://${host}`);
      expect(sources).toContain(`https://*.${host}`);
    }
  });

  it("stops the browser loading an image from anywhere else", () => {
    const imgSrc = buildContentSecurityPolicy()
      .split("; ")
      .find((line) => line.startsWith("img-src "));
    expect(imgSrc).toBeTruthy();
    // A bare `https:` would let a photo stored before this rule keep loading.
    expect(imgSrc).not.toMatch(/\shttps:(\s|$)/);
    for (const source of avatarImgSources()) {
      expect(imgSrc).toContain(source);
    }
  });
});
