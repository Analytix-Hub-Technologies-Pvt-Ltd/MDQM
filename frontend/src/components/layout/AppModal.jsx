import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Dashboard pages scroll inside <main>, not window — lock/restore that element. */
function getPageScrollElement() {
  return document.querySelector("main.flex-1.overflow-y-auto") || document.documentElement;
}

function restoreScrollPosition(scrollEl, scrollTop) {
  scrollEl.scrollTop = scrollTop;
  requestAnimationFrame(() => {
    scrollEl.scrollTop = scrollTop;
  });
}

/**
 * Theme-aware modal shell (light + dark). Portaled to document.body so fixed
 * centering is not broken by Framer Motion transforms on dashboard ancestors.
 */
export function AppModal({
  open,
  onClose,
  title,
  description,
  headerContent,
  children,
  footer,
  maxWidth = "max-w-4xl",
  className,
  bodyClassName,
  showDefaultFooter = true,
}) {
  const triggerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    triggerRef.current = document.activeElement;
    const scrollEl = getPageScrollElement();
    const scrollTop = scrollEl.scrollTop;

    const prevScrollOverflow = scrollEl.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    scrollEl.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }

    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      scrollEl.style.overflow = prevScrollOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      restoreScrollPosition(scrollEl, scrollTop);
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function") {
        try {
          trigger.focus({ preventScroll: true });
        } catch {
          trigger.focus();
        }
      }
      if (trigger && typeof trigger.scrollIntoView === "function") {
        trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        restoreScrollPosition(scrollEl, scrollTop);
      }
    };
  }, [open]);

  if (!open) return null;

  const showHeader = headerContent || title || description;

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden
        onClick={() => onClose?.()}
      />

      <div className="relative flex min-h-full justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "app-modal-title" : undefined}
          className={cn(
            "pointer-events-auto my-auto flex w-full max-h-[min(90vh,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl",
            maxWidth,
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {showHeader ? (
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
              {headerContent ? (
                <div className="min-w-0 flex-1">{headerContent}</div>
              ) : (
                <div className="min-w-0">
                  {title ? (
                    <h2 id="app-modal-title" className="text-sm font-bold uppercase tracking-wider text-foreground">
                      {title}
                    </h2>
                  ) : null}
                  {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          ) : null}

          <div className={cn("min-h-0 flex-1 overflow-y-auto p-5 text-sm", bodyClassName)}>{children}</div>

          {footer !== undefined ? (
            <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
          ) : showDefaultFooter ? (
            <div className="shrink-0 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" className="w-full" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Light/dark section card inside a modal */
export function ModalSection({ title, children, className }) {
  return (
    <section className={cn("rounded-xl border border-border bg-muted/40 p-4 space-y-3", className)}>
      {title ? (
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      ) : null}
      {children}
    </section>
  );
}

export function ModalAlert({ variant = "info", children, className }) {
  const variants = {
    info: "border-info/30 bg-info/10 text-foreground",
    success: "border-success/30 bg-success/10 text-foreground",
    warning: "border-warning/30 bg-warning/10 text-foreground",
    danger: "border-destructive/30 bg-destructive/10 text-foreground",
  };
  return (
    <p className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", variants[variant] || variants.info, className)}>
      {children}
    </p>
  );
}

export const modalInputClass =
  "mt-1 w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-medium text-[var(--input-foreground)] placeholder:font-normal placeholder:text-[var(--placeholder)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export const modalLabelClass = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function ModalFileInput({ id, accept = ".csv", file, onFileChange, className }) {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <div className={cn("mt-1", className)}>
      <input
        id={inputId}
        key={file ? file.name : "empty"}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onFileChange?.(e.target.files?.[0] || null)}
      />
      <label
        htmlFor={inputId}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <Upload className="h-4 w-4 shrink-0" strokeWidth={2} />
        {file ? "Change file" : "Choose CSV file"}
      </label>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {file ? (
          <>
            <span className="font-medium text-foreground">Selected:</span> {file.name}
          </>
        ) : (
          "No file chosen"
        )}
      </p>
    </div>
  );
}
