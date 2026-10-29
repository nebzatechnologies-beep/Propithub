import { useState, useEffect } from 'react';

interface ScrollDirectionOptions {
  threshold?: number; // Minimum pixels scrolled before direction changes
  topThreshold?: number; // Distance from top considered "at top"
}

export function useScrollDirection(options: ScrollDirectionOptions = {}) {
  const { threshold = 10, topThreshold = 50 } = options;
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | 'top'>('top');
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;

      if (scrollY <= topThreshold) {
        setIsAtTop(true);
        setIsScrolledDown(false);
        setScrollDirection('top');
        ticking = false;
        return;
      }

      setIsAtTop(false);

      const diff = scrollY - lastScrollY;

      if (Math.abs(diff) >= threshold) {
        if (diff > 0) {
          // Scrolling down
          setScrollDirection('down');
          setIsScrolledDown(true);
        } else {
          // Scrolling up
          setScrollDirection('up');
          setIsScrolledDown(false);
        }
        lastScrollY = scrollY;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topThreshold]);

  return {
    scrollDirection,
    isScrolledDown,
    isAtTop,
    isCollapsed: isScrolledDown, // True when user scrolls down -> shrink FAB
  };
}
