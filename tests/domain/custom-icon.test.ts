import { describe, expect, it } from "vitest";
import { CustomIcon, CustomIcons, Icon } from "../../src/domain";

const ID = "0a1b2c3d-0000-4000-8000-00000000abcd";
const OTHER_ID = "0a1b2c3d-0000-4000-8000-00000000ef01";

describe("CustomIcon", () => {
  it("keeps its id, bytes and name", () => {
    const data = new Uint8Array([1, 2, 3]);
    const icon = new CustomIcon(ID, data, "Bank");
    expect(icon.id).toBe(ID);
    expect(icon.data).toBe(data);
    expect(icon.name).toBe("Bank");
  });

  it("defaults to no name", () => {
    expect(new CustomIcon(ID, new Uint8Array()).name).toBe("");
  });

  it("rejects an empty id", () => {
    expect(() => new CustomIcon(" ", new Uint8Array())).toThrow("must not be empty");
  });

  it("creates icons with fresh ids a custom Icon can point at", () => {
    const first = CustomIcon.create(new Uint8Array([1]), "One");
    const second = CustomIcon.create(new Uint8Array([2]));
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe("One");
    expect(Icon.custom(first.id).key).toBe(first.id);
  });
});

describe("CustomIcons", () => {
  const icon = new CustomIcon(ID, new Uint8Array([1]));
  const other = new CustomIcon(OTHER_ID, new Uint8Array([2]));

  it("starts empty", () => {
    expect(CustomIcons.EMPTY.size).toBe(0);
    expect(CustomIcons.EMPTY.values).toEqual([]);
    expect(CustomIcons.EMPTY.get(ID)).toBeUndefined();
    expect(CustomIcons.EMPTY.has(ID)).toBe(false);
  });

  it("adds icons in order without changing the original", () => {
    const icons = CustomIcons.EMPTY.add(icon).add(other);
    expect(icons.values).toEqual([icon, other]);
    expect(icons.get(OTHER_ID)).toBe(other);
    expect(CustomIcons.EMPTY.size).toBe(0);
  });

  it("replaces an icon added again under the same id", () => {
    const replacement = new CustomIcon(ID, new Uint8Array([9]));
    const icons = new CustomIcons([icon, other]).add(replacement);
    expect(icons.size).toBe(2);
    expect(icons.get(ID)).toBe(replacement);
  });

  it("removes an icon, and returns itself when there's nothing to remove", () => {
    const icons = new CustomIcons([icon, other]);
    expect(icons.remove(ID).values).toEqual([other]);
    expect(icons.remove("missing")).toBe(icons);
  });
});
