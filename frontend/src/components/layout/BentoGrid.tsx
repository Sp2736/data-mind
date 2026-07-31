import React from "react";

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoGrid({ children, className = "" }: BentoGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 ${className}`}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: string;
  rowSpan?: string;
}

export function BentoCard({
  children,
  className = "",
  colSpan = "col-span-1",
  rowSpan = "",
}: BentoCardProps) {
  return (
    <div
      className={`group relative rounded-3xl bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800/90 p-6 sm:p-7 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${colSpan} ${rowSpan} ${className}`}
    >
      {children}
    </div>
  );
}
