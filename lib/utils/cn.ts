// Utility function for merging Tailwind CSS classes
// Simple version of clsx + tailwind-merge without external dependencies

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes
    .filter(Boolean)
    .join(' ')
    .replace(/className/g, '')
    .trim();
}
