"use client";

import { useEffect, useRef, useState } from "react";
import { canvasToBlob, renderShareCard, type CardInput } from "@/utils/shareCard";
import { Button, Sheet } from "./ui";
import { useI18n } from "@/i18n/react";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  card: (name: string | null) => CardInput;
  link: (name: string | null) => string;
  text: (name: string | null) => string;
  name: string;
  onNameChange: (n: string) => void;
  onShared: (channel: "web_share" | "image" | "copy_link" | "download") => void;
  /** False where file downloads/Web Share are blocked (sandboxed embeds): the card is saved by long-press instead. */
  imageSharing?: boolean;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareSheet({ open, onClose, title, card, link, text, name, onNameChange, onShared, imageSharing = true }: ShareSheetProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const linkInput = useRef<HTMLInputElement | null>(null);
  const cleanName = name.trim() || null;
  const url = link(cleanName);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const c = await renderShareCard(card(cleanName));
      if (cancelled) return;
      canvasRef.current = c;
      setPreview(c.toDataURL("image/png"));
    }, preview ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cleanName, t]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const copyLink = async () => {
    if (await copy(url)) setToast(t("share.copied"));
    else {
      linkInput.current?.select();
      setToast(t("share.select"));
    }
    onShared("copy_link");
  };

  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "ERA XI", text: text(cleanName), url });
        onShared("web_share");
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const shareImage = async () => {
    const c = canvasRef.current ?? (await renderShareCard(card(cleanName)));
    const blob = await canvasToBlob(c);
    if (!blob) return;
    const file = new File([blob], "era-xi.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], text: `${text(cleanName)} ${url}` });
        onShared("image");
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "era-xi.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setToast(t("share.saved"));
    onShared("download");
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-[12px] border border-line bg-ink">
        {preview ? (
          <img src={preview} alt={t("share.previewAlt")} className="h-full w-full" />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-ash">{t("share.rendering")}</div>
        )}
      </div>

      <label className="mt-4 block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("share.name")}</span>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value.slice(0, 16))}
          placeholder={t("share.namePlaceholder")}
          maxLength={16}
          autoComplete="nickname"
          className="mt-1.5 h-12 w-full rounded-[10px] border border-line bg-ink px-3 text-[16px] text-chalk placeholder:text-ash focus:border-chalk/40 focus:outline-none"
        />
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <Button onClick={shareLink} className="w-full">
          {t("share.challenge")}
        </Button>
        <div className={`grid gap-2 ${imageSharing ? "grid-cols-2" : "grid-cols-1"}`}>
          {imageSharing && (
            <Button variant="secondary" onClick={shareImage} className="h-12 text-[18px]">
              {t("share.image")}
            </Button>
          )}
          <Button variant="secondary" onClick={copyLink} className="h-12 text-[18px]">
            {t("share.copy")}
          </Button>
        </div>
        {!imageSharing && <p className="text-center text-[11.5px] text-ash">{t("share.longpress")}</p>}
        <input
          ref={linkInput}
          readOnly
          value={url}
          aria-label={t("share.linkAria")}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 h-11 w-full truncate rounded-[8px] bg-transparent px-1 font-mono text-[11px] text-ash focus:outline-none"
        />
      </div>
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center" role="status">
          <span className="animate-rise rounded-full bg-chalk px-4 py-2 text-[13px] font-semibold text-ink">{toast}</span>
        </div>
      )}
    </Sheet>
  );
}
