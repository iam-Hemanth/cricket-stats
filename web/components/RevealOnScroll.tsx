'use client';

import { useEffect } from 'react';

export default function RevealOnScroll() {
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal-v2');
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-v2');
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    elements.forEach((el) => observer.observe(el));

    const revealVisibleElements = () => {
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 50 && rect.bottom > 0) {
          el.classList.add('in-v2');
        }
      });
    };

    const frameId = window.requestAnimationFrame(revealVisibleElements);

    return () => {
      window.cancelAnimationFrame(frameId);
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  return null;
}
