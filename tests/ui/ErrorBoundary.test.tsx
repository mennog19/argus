import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultSaveConflictError } from "../../src/application/vault-access-service";
import { ErrorBoundary } from "../../src/ui/ErrorBoundary";

function Broken({ error }: { error: unknown }): never {
  throw error;
}

function renderBoundary(children: ReactNode) {
  const onCrash = vi.fn();
  const onRestart = vi.fn();
  const view = render(
    <ErrorBoundary onCrash={onCrash} onRestart={onRestart}>
      {children}
    </ErrorBoundary>,
  );
  return { onCrash, onRestart, unmount: view.unmount };
}

function dispatchRejection(reason: unknown) {
  act(() => {
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
  });
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs every caught render error; the tests cause them on purpose.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when nothing goes wrong", () => {
    const { onCrash } = renderBoundary(<p>All good</p>);

    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onCrash).not.toHaveBeenCalled();
  });

  it("shows a crash screen with the error instead of an empty window", () => {
    const { onCrash } = renderBoundary(<Broken error={new Error("entry list exploded")} />);

    expect(screen.getByRole("heading", { name: "Argus ran into a problem" })).toBeInTheDocument();
    expect(screen.getByText("entry list exploded")).toBeInTheDocument();
    expect(screen.getByText(/Your vault has been locked/)).toBeInTheDocument();
    expect(onCrash).toHaveBeenCalledTimes(1);
  });

  it("still says something when what was thrown has no message", () => {
    renderBoundary(<Broken error={undefined} />);

    expect(screen.getByText("Unknown error.")).toBeInTheDocument();
  });

  it("restarts from the crash screen", async () => {
    const user = userEvent.setup();
    const { onRestart } = renderBoundary(<Broken error={new Error("boom")} />);

    await user.click(screen.getByRole("button", { name: "Restart Argus" }));

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("reports a promise rejection nobody handled, and keeps the app on screen", async () => {
    const user = userEvent.setup();
    const { onCrash } = renderBoundary(<p>All good</p>);

    dispatchRejection(new Error("save failed"));

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong: save failed");
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(onCrash).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dismiss error" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves a save conflict to the dialog that already asks how to resolve it", () => {
    renderBoundary(<p>All good</p>);

    dispatchRejection(new VaultSaveConflictError("C:/vaults/mine.kdbx"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports the plain string Tauri rejects a failed command with", () => {
    renderBoundary(<p>All good</p>);

    dispatchRejection("forbidden path");

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong: forbidden path");
  });

  it("reports an error thrown outside rendering, such as from a click handler", () => {
    renderBoundary(<p>All good</p>);

    act(() => {
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("handler blew up") }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong: handler blew up");
  });

  it("ignores browser notices that carry no error", () => {
    renderBoundary(<p>All good</p>);

    act(() => {
      window.dispatchEvent(
        new ErrorEvent("error", { message: "ResizeObserver loop limit exceeded" }),
      );
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stops listening once unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderBoundary(<p>All good</p>);

    unmount();

    expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });
});
