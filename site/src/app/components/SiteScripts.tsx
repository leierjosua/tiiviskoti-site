"use client";

import { useEffect } from "react";

export default function SiteScripts() {
  useEffect(() => {
    const nav = document.getElementById("nav");
    const nl = document.getElementById("nlinks");
    const burger = document.getElementById("burger");

    const onScroll = () => nav?.classList.toggle("scr", window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const onBurger = () => nl?.classList.toggle("op");
    burger?.addEventListener("click", onBurger);
    const linkHandlers: Array<() => void> = [];
    nl?.querySelectorAll("a").forEach((a) => {
      const h = () => nl.classList.remove("op");
      a.addEventListener("click", h);
      linkHandlers.push(() => a.removeEventListener("click", h));
    });

    // FAQ accordion
    const qs = Array.from(document.querySelectorAll<HTMLElement>("#faq .q"));
    const faqHandlers: Array<() => void> = [];
    qs.forEach((q) => {
      const btn = q.querySelector("button");
      const a = q.querySelector<HTMLElement>(".a");
      if (!btn || !a) return;
      const h = () => {
        const open = q.classList.contains("op");
        qs.forEach((x) => { x.classList.remove("op"); const xa = x.querySelector<HTMLElement>(".a"); if (xa) xa.style.maxHeight = ""; });
        if (!open) { q.classList.add("op"); a.style.maxHeight = a.scrollHeight + "px"; }
      };
      btn.addEventListener("click", h);
      faqHandlers.push(() => btn.removeEventListener("click", h));
    });

    // reveal on scroll
    document.querySelectorAll<HTMLElement>(".steps,.inc3,.revs,.addons,.team").forEach((g) =>
      Array.from(g.children).forEach((ch, i) => { (ch as HTMLElement).style.transitionDelay = i * 80 + "ms"; })
    );
    const rvEls = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    const rvv = () => rvEls.forEach((el) => { if (!el.classList.contains("in") && el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add("in"); });
    rvv();
    window.addEventListener("scroll", rvv, { passive: true });
    window.addEventListener("resize", rvv);
    const safety = setTimeout(() => rvEls.forEach((el) => el.classList.add("in")), 1800);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", rvv);
      window.removeEventListener("resize", rvv);
      burger?.removeEventListener("click", onBurger);
      linkHandlers.forEach((f) => f());
      faqHandlers.forEach((f) => f());
      clearTimeout(safety);
    };
  }, []);

  return null;
}
