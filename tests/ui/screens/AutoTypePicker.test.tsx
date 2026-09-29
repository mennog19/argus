import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AutoTypeRequest } from "../../../src/application/auto-type-service";
import { Entry } from "../../../src/domain";
import { AutoTypePicker } from "../../../src/ui/screens/AutoTypePicker";

const GITHUB = Entry.create({ title: "GitHub", username: "menno", url: "https://github.com" });
const GITHUB_WORK = Entry.create({ title: "GitHub work", url: "https://github.com" });

function request(overrides: Partial<AutoTypeRequest> = {}): AutoTypeRequest {
  return {
    window: { title: "Sign in to GitHub — Firefox", processName: "firefox.exe", isBrowser: false },
    matches: [
      { entry: GITHUB, score: 3, verified: false },
      { entry: GITHUB_WORK, score: 3, verified: false },
    ],
    titleMismatches: [],
    ...overrides,
  };
}

function renderPicker(overrides: Partial<AutoTypeRequest> = {}) {
  const onTypeInto = vi.fn();
  const onCancel = vi.fn();
  render(
    <AutoTypePicker request={request(overrides)} onTypeInto={onTypeInto} onCancel={onCancel} />,
  );
  return { onTypeInto, onCancel };
}

describe("AutoTypePicker", () => {
  it("names the window the keystrokes will go to", () => {
    renderPicker();

    expect(screen.getByText("Sign in to GitHub — Firefox")).toBeInTheDocument();
    expect(screen.getByText(/firefox\.exe/)).toBeInTheDocument();
  });

  it("describes an untitled window rather than showing nothing", () => {
    renderPicker({ window: { title: "", processName: "", isBrowser: false } });

    expect(screen.getByText("an untitled window")).toBeInTheDocument();
  });

  it("lists every match with its username", () => {
    renderPicker();

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("GitHub");
    expect(options[0]).toHaveTextContent("menno");
  });

  it("says so when an entry has no username", () => {
    renderPicker();

    expect(screen.getByText("no username")).toBeInTheDocument();
  });

  it("selects the strongest match up front so Enter is one keystroke", () => {
    renderPicker();

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "false");
  });

  it("types the selected entry on Enter", async () => {
    const { onTypeInto } = renderPicker();

    await userEvent.keyboard("{Enter}");

    expect(onTypeInto).toHaveBeenCalledWith(GITHUB);
  });

  it("moves the selection down with the arrow keys", async () => {
    const { onTypeInto } = renderPicker();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onTypeInto).toHaveBeenCalledWith(GITHUB_WORK);
  });

  it("wraps around from the last match back to the first", async () => {
    const { onTypeInto } = renderPicker();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onTypeInto).toHaveBeenCalledWith(GITHUB);
  });

  it("wraps backwards from the first match to the last", async () => {
    const { onTypeInto } = renderPicker();

    await userEvent.keyboard("{ArrowUp}{Enter}");

    expect(onTypeInto).toHaveBeenCalledWith(GITHUB_WORK);
  });

  it("cancels on Escape", async () => {
    const { onCancel } = renderPicker();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });

  it("ignores keys it has no use for", async () => {
    const { onTypeInto, onCancel } = renderPicker();

    await userEvent.keyboard("x");

    expect(onTypeInto).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("types an entry that is clicked", async () => {
    const { onTypeInto } = renderPicker();

    await userEvent.click(screen.getAllByRole("option")[1]);

    expect(onTypeInto).toHaveBeenCalledWith(GITHUB_WORK);
  });

  it("cancels from the button", async () => {
    const { onCancel } = renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("explains what to do when nothing matched, and offers no list", () => {
    renderPicker({ matches: [] });

    expect(screen.getByText(/Nothing in this vault matches that window/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("resets the selection when a second press captures a different window", () => {
    const onTypeInto = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <AutoTypePicker request={request()} onTypeInto={onTypeInto} onCancel={onCancel} />,
    );
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    rerender(
      <AutoTypePicker
        request={request({
          window: { title: "Bank — Firefox", processName: "firefox.exe", isBrowser: false },
        })}
        onTypeInto={onTypeInto}
        onCancel={onCancel}
      />,
    );

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  describe("in a browser", () => {
    const CHROME = {
      title: "Sign in to GitHub — Google Chrome",
      processName: "chrome.exe",
      isBrowser: true,
    };

    it("shows the address it matched against, and labels each match by what it rests on", () => {
      const noUrl = Entry.create({ title: "GitHub notes" });
      renderPicker({
        window: { ...CHROME, url: "https://github.com/login" },
        matches: [
          { entry: GITHUB, score: 4, verified: true },
          { entry: noUrl, score: 1, verified: false },
        ],
      });

      expect(screen.getByText("github.com")).toBeInTheDocument();
      const [addressMatch, titleMatch] = screen.getAllByRole("option");
      expect(addressMatch).toHaveTextContent("Address match");
      expect(titleMatch).toHaveTextContent("Title only");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("warns about a page whose title names entries its address rules out", () => {
      renderPicker({
        window: { ...CHROME, url: "https://github.evil.example/session" },
        matches: [],
        titleMismatches: [GITHUB, Entry.create({ url: "https://github.com" })],
      });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "This page's title points at GitHub, (untitled), but its address is " +
          "github.evil.example. It may be a fake sign-in page, so those entries aren't offered here.",
      );
    });

    it("says what the address is even when it has no host to show", () => {
      renderPicker({
        window: { ...CHROME, url: "" },
        matches: [],
        titleMismatches: [GITHUB],
      });

      expect(screen.getByRole("alert")).toHaveTextContent("but its address is something else.");
    });

    it("warns that matches rest on the title when the address couldn't be read", () => {
      renderPicker({ window: CHROME });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Argus couldn't read this browser's address bar",
      );
      expect(screen.getAllByRole("option")[0]).toHaveTextContent("Title only");
    });
  });

  it("shows no badges or warnings for an app that isn't a browser", () => {
    renderPicker();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Title only")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Address/)).not.toBeInTheDocument();
  });
});
