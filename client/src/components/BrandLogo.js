import React from "react";

export function BrandLogo({ className = "h-8 w-8", showText = true }) {
  return (
    <div className="flex items-center gap-3 select-none group cursor-pointer">
      {/* The Supersonic Wing Icon */}
      <div className="relative">
      ⚡
      </div>

      {/* Brand Text */}
      {showText && (
        <span className="text-2xl font-black tracking-tight text-slate-900 group-hover:text-slate-950 transition-colors">
          Hire<span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">Pilot</span>
        </span>
      )}
    </div>
  );
}

export default BrandLogo;