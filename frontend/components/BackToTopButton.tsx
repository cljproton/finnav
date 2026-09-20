// @ts-nocheck
"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Ionicons } from "../components/ui/icons";
import { useTranslation } from "react-i18next";

export interface BackToTopHandle {
  handleScroll: (y: number) => void;
}

interface BackToTopButtonProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  threshold?: number;
}

export const BackToTopButton = forwardRef<HTMLDivElement, BackToTopButtonProps>(
  function BackToTopButton({ threshold = 400 }, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [opacity, setOpacity] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        handleScroll: (y: number) => {
          const show = y > threshold;
          setVisible(show);
        },
      }),
      [threshold],
    );

    useEffect(() => {
      const handler = () => {
        const y = window.scrollY;
        setVisible(y > threshold);
      };
      window.addEventListener("scroll", handler, { passive: true });
      return () => window.removeEventListener("scroll", handler);
    }, [threshold]);

    useEffect(() => {
      const timer = setTimeout(() => setOpacity(visible ? 1 : 0), 0);
      return () => clearTimeout(timer);
    }, [visible, opacity]);

    const scrollToTop = useCallback(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    if (!visible) return null;

return (
       <div
         style={{
           position: "fixed",
           bottom: 84,
           right: 16,
           zIndex: 40,
         }}
       >
         <div
           className="fn-transition-base fn-pointer-events-auto"
           style={{ opacity, transition: "opacity 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
         >
           <button
             type="button"
             className="fn-flex fn-items-center fn-justify-center fn-rounded-full fn-shadow-lg fn-transition-fast fn-cursor-pointer"
             style={{
               width: 46,
               height: 46,
               borderRadius: 23,
               backgroundColor: "var(--fn-primary)",
               boxShadow: "0 4px 16px rgba(79,70,229,0.3)",
             }}
             onClick={scrollToTop}
             aria-label="返回顶部"
             onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
             onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
             onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
           >
             <svg
               width="22"
               height="22"
               viewBox="0 0 24 24"
               fill="none"
               stroke="currentColor"
               strokeWidth="2"
               strokeLinecap="round"
               strokeLinejoin="round"
               aria-hidden="true"
               style={{ color: "white" }}
             >
               <path d="M18 15l-6-6-6 6" />
             </svg>
           </button>
         </div>
       </div>
     );
  },
);

export default BackToTopButton;