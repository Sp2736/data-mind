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
      className={`
        group relative rounded-3xl overflow-hidden
        bg-white dark:bg-[#191921]
        border border-blue-100/60 dark:border-stone-800/90
        p-6 sm:p-7
        shadow-[0_2px_12px_0_rgb(37_99_235/0.06),0_1px_3px_0_rgb(15_23_42/0.05)]
        dark:shadow-sm
        hover:shadow-[0_4px_20px_0_rgb(37_99_235/0.10),0_1px_4px_0_rgb(15_23_42/0.06)]
        dark:hover:shadow-md
        hover:-translate-y-0.5
        transition-all duration-200
        animate-fade-in-scale
        ${colSpan} ${rowSpan} ${className}
      `}
    >
      {children}
    </div>
  );
}

