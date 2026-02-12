import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function PullToRefresh({ children, onRefresh }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (isRefreshing) return;
    
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY.current;
    
    if (distance > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(distance, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 500);
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullDistance > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-30 transition-transform"
          style={{ transform: `translateY(${pullDistance - 40}px)` }}
        >
          <div className="bg-[var(--card-bg)] rounded-full p-2 shadow-lg border border-[var(--border-color)]">
            <RefreshCw 
              className={`w-5 h-5 text-[var(--accent-color)] ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}