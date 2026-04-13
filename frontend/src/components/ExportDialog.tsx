import { useState, type ReactNode } from "react";
import {
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { FileJson, FileImage, FileCode2 } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface Props {
  title: string;
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: BinaryFiles | null;
  onClose: () => void;
}

type Format = "excalidraw" | "png" | "svg";

function slugifyTitle(title: string): string {
  const s = title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
  return s || "untitled";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const WATERMARK_TEXT = "Sketched in Excalidraw · Editorial Atelier";

async function addPngWatermark(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const footerH = 28;
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height + footerH;
      const ctx = canvas.getContext("2d")!;
      // Draw original image
      ctx.drawImage(img, 0, 0);
      // Draw footer bar
      ctx.fillStyle = "#FAF7F0";
      ctx.fillRect(0, img.height, canvas.width, footerH);
      // Draw text
      ctx.fillStyle = "#8C7FA3";
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText(WATERMARK_TEXT, canvas.width / 2, img.height + 18);
      canvas.toBlob(
        (result) => resolve(result || blob),
        "image/png",
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(blob);
    };
    img.src = URL.createObjectURL(blob);
  });
}

function addSvgWatermark(svg: SVGSVGElement): void {
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return;
  const parts = viewBox.split(" ").map(Number);
  if (parts.length !== 4) return;
  const [x, y, w, h] = parts;
  const footerH = 28;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h + footerH}`);
  // Update height
  const currentH = svg.getAttribute("height");
  if (currentH) {
    svg.setAttribute("height", String(parseFloat(currentH) + footerH));
  }
  // Footer background
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y + h));
  rect.setAttribute("width", String(w));
  rect.setAttribute("height", String(footerH));
  rect.setAttribute("fill", "#FAF7F0");
  svg.appendChild(rect);
  // Footer text
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x + w / 2));
  text.setAttribute("y", String(y + h + 18));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "#8C7FA3");
  text.setAttribute("font-family", "JetBrains Mono, monospace");
  text.setAttribute("font-size", "10");
  text.setAttribute("letter-spacing", "0.12em");
  text.textContent = WATERMARK_TEXT.toUpperCase();
  svg.appendChild(text);
}

export function ExportDialog({
  title,
  elements,
  appState,
  files,
  onClose,
}: Props) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: Format): Promise<void> {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const base = slugifyTitle(title);
      // The Excalidraw library expects its own typed element/appstate shapes;
      // cast through unknown to keep our persistence layer type-loose.
      const typedElements =
        elements as unknown as readonly ExcalidrawElement[];
      const typedAppState = appState as unknown as Partial<AppState>;
      const typedFiles = files ?? ({} as BinaryFiles);

      if (format === "excalidraw") {
        const json = serializeAsJSON(
          typedElements,
          typedAppState,
          typedFiles,
          "local",
        );
        const blob = new Blob([json], { type: "application/json" });
        triggerDownload(blob, `${base}.excalidraw`);
      } else if (format === "png") {
        const blob = await exportToBlob({
          elements: typedElements,
          appState: typedAppState,
          files: typedFiles,
          mimeType: "image/png",
          quality: 1,
        });
        // Add watermark footer
        const watermarked = await addPngWatermark(blob);
        triggerDownload(watermarked, `${base}.png`);
      } else {
        const svg = await exportToSvg({
          elements: typedElements,
          appState: typedAppState,
          files: typedFiles,
        });
        // Add watermark footer to SVG
        addSvgWatermark(svg);
        const text = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([text], { type: "image/svg+xml" });
        triggerDownload(blob, `${base}.svg`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Export."
      description="CHOOSE A FORMAT"
      size="md"
    >
      <div className="space-y-4">
        <ul className="border border-rule divide-y divide-rule bg-paper-deep">
          <ExportRow
            icon={<FileJson />}
            label="Excalidraw file"
            caption=".excalidraw JSON"
            busy={busy === "excalidraw"}
            disabled={busy !== null}
            onClick={() => void handleExport("excalidraw")}
          />
          <ExportRow
            icon={<FileImage />}
            label="PNG image"
            caption="Raster export"
            busy={busy === "png"}
            disabled={busy !== null}
            onClick={() => void handleExport("png")}
          />
          <ExportRow
            icon={<FileCode2 />}
            label="SVG image"
            caption="Vector export"
            busy={busy === "svg"}
            disabled={busy !== null}
            onClick={() => void handleExport("svg")}
          />
        </ul>
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Modal>
  );
}

interface ExportRowProps {
  icon: ReactNode;
  label: string;
  caption: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ExportRow({
  icon,
  label,
  caption,
  busy,
  disabled,
  onClick,
}: ExportRowProps) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="group/row flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-plum-haze disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center bg-paper border border-rule text-plum [&_svg]:size-4"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif italic text-xl text-ink leading-tight">
            {label}
          </span>
          <span className="mt-1 block font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
            // {caption}
          </span>
        </span>
        <span className="shrink-0 font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade group-hover/row:text-plum">
          {busy ? <Spinner /> : "↓"}
        </span>
      </button>
    </li>
  );
}
