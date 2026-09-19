import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("Hello, test!"),
}));

describe("App", () => {
  it("renders the welcome heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /welcome to tauri \+ react/i }),
    ).toBeInTheDocument();
  });

  it("greets the entered name via the Tauri command", async () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/enter a name/i), {
      target: { value: "Argus" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /greet/i }));

    expect(await screen.findByText("Hello, test!")).toBeInTheDocument();
  });
});
