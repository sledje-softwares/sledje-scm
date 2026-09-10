// Skeleton loading primitives.
//
// Every page that waits on an API call should render one of these in place of
// its content while `loading` is true, instead of a spinner or a bare "Loading…"
// string. The shapes below mirror the real layouts closely enough that the page
// doesn't jump when data arrives.
//
// Base look: a slate block with the `.skeleton` shimmer from index.css (falls
// back to Tailwind's `animate-pulse` if the stylesheet hasn't loaded).

import React from "react";

export function Skeleton({ className = "", rounded = "rounded-md" }) {
  return <div className={`skeleton animate-pulse bg-slate-200 ${rounded} ${className}`} />;
}

// A stack of text lines. The last line is shortened so it reads as a paragraph.
export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

// One "metric" tile — icon chip, label, value. Matches the Stat/SummaryCard
// blocks used across the distributor and retailer dashboards.
export function SkeletonStat() {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
      <Skeleton className="h-9 w-9 mb-3" rounded="rounded-lg" />
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-6 w-16" />
    </div>
  );
}

export function SkeletonStatGrid({ count = 4, className = "grid grid-cols-2 lg:grid-cols-4 gap-4" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

// A product/order card: image band, title, a couple of meta rows, a button.
export function SkeletonCard({ media = true }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {media && <Skeleton className="h-40 w-full" rounded="rounded-none" />}
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="grid grid-cols-3 gap-3 pt-1">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
        <Skeleton className="h-9 w-full mt-1" rounded="rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonCardGrid({
  count = 6,
  media = true,
  className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6",
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} media={media} />
      ))}
    </div>
  );
}

// A vertical list of rows inside a bordered card — payments, connections, runs.
export function SkeletonList({ rows = 4, className = "" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 ${className}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10" rounded="rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

// A table body placeholder. Pass the same column count as the real table so the
// header above it stays aligned.
export function SkeletonTableRows({ rows = 5, cols = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 last:border-none">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-6 py-4">
              <Skeleton className={`h-3.5 ${c === 0 ? "w-32" : "w-16"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default Skeleton;
