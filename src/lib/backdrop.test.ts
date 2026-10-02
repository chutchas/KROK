import { describe, it, expect, vi, afterEach } from "vitest";
import { backdropClose } from "./backdrop";

type El = { dataset: Record<string, string>; tagName: string; selectionStart?: number; selectionEnd?: number };
const el = (tagName = "DIV"): El => ({ dataset: {}, tagName });
const ev = (target: El, currentTarget: El) => ({ target, currentTarget }) as unknown as React.MouseEvent<HTMLElement>;

function fakeDom(active: El | null, pageSelection = "") {
  vi.stubGlobal("document", { activeElement: active });
  vi.stubGlobal("window", { getSelection: () => ({ isCollapsed: !pageSelection, toString: () => pageSelection }) });
}

afterEach(() => vi.unstubAllGlobals());

describe("backdropClose", () => {
  it("closes on a plain click on the backdrop", () => {
    fakeDom(null);
    const back = el(), onClose = vi.fn(), h = backdropClose(onClose);
    h.onMouseDown(ev(back, back));
    h.onClick(ev(back, back));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the press started inside the box (drag-select out)", () => {
    fakeDom(null);
    const back = el(), input = el("INPUT"), onClose = vi.fn(), h = backdropClose(onClose);
    h.onPointerDown(ev(input, back));
    h.onMouseDown(ev(input, back));
    h.onClick(ev(back, back));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close while text in the focused input is selected", () => {
    const input = { ...el("INPUT"), selectionStart: 0, selectionEnd: 7 };
    fakeDom(input);
    const back = el(), onClose = vi.fn(), h = backdropClose(onClose);
    h.onMouseDown(ev(back, back));
    h.onClick(ev(back, back));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close while page text is selected", () => {
    fakeDom(null, "someone@example.com");
    const back = el(), onClose = vi.fn(), h = backdropClose(onClose);
    h.onMouseDown(ev(back, back));
    h.onClick(ev(back, back));
    expect(onClose).not.toHaveBeenCalled();
  });
});
