"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { Button } from "./ui";

interface Props {
  /** Changes whenever the player navigates: a new screen gets a fresh boundary. */
  resetKey: string;
  onRecover: () => void;
  onError?: (error: Error) => void;
  children: ReactNode;
}

/**
 * Never a blank screen: a rendering failure shows a way back to the menu instead.
 * Records live in localStorage and are untouched by a rendering failure.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean; key: string }> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error);
    if (process.env.NODE_ENV !== "production") console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Fallback
        onRecover={() => {
          this.setState({ failed: false });
          this.props.onRecover();
        }}
      />
    );
  }
}

function Fallback({ onRecover }: { onRecover: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-4 px-6" role="alert">
      <h1 className="font-display text-[32px] font-extrabold uppercase leading-none">{t("error.title")}</h1>
      <p className="text-[15px] leading-snug text-ash-2">{t("error.body")}</p>
      <Button onClick={onRecover} className="h-[56px] w-full text-[22px]">
        {t("error.home")}
      </Button>
    </main>
  );
}
