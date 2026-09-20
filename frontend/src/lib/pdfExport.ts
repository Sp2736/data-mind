import React from "react";

export async function generateProfessionalPDF(
  templateRef: React.RefObject<HTMLDivElement | null>,
  filename: string
): Promise<void> {
  const container = templateRef.current;
  if (!container) {
    throw new Error("Template reference is null");
  }

  // Extract HTML of the container
  const clone = container.cloneNode(true) as HTMLElement;
  clone.classList.remove("hidden", "print:block");
  clone.style.position = "static";
  clone.style.left = "auto";
  clone.style.top = "auto";
  const htmlContent = clone.outerHTML;

  // Call the Next.js API route that uses Puppeteer
  const response = await fetch("/api/export-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ html: htmlContent }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate PDF on server");
  }

  // Get the PDF blob and trigger a download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
