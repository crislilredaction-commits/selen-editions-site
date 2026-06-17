function splitFileName(name: string) {
  const trimmedName = name.trim();
  const lastDotIndex = trimmedName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === trimmedName.length - 1) {
    return {
      baseName: trimmedName,
      extension: "",
    };
  }

  return {
    baseName: trimmedName.slice(0, lastDotIndex),
    extension: trimmedName.slice(lastDotIndex + 1),
  };
}

function slugifyFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019`\u00b4]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createSafeStorageFileName(
  originalName: string | null | undefined,
  fallbackName = "document.pdf",
) {
  const sourceName = originalName?.trim() || fallbackName;
  const { baseName, extension } = splitFileName(sourceName);
  const safeBaseName = slugifyFilePart(baseName) || "document";
  const safeExtension = slugifyFilePart(extension);

  return safeExtension ? `${safeBaseName}.${safeExtension}` : safeBaseName;
}

export function createUniqueStorageFileName(
  originalName: string | null | undefined,
  fallbackName = "document.pdf",
) {
  return `${Date.now()}-${crypto.randomUUID()}-${createSafeStorageFileName(
    originalName,
    fallbackName,
  )}`;
}
