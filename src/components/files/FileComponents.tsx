import * as React from "react";
import { AlertCircle, Download, Eye, FileText, ImageIcon, RefreshCcw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  SecureFileMetadata,
  downloadUrlFor,
  previewUrlFor,
  thumbnailUrlFor,
  uploadSecureFiles,
} from "@/integrations/filesApi";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt"];

export const formatFileSize = (bytes?: number | null) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
};

const statusLabel = (status: SecureFileMetadata["status"]) => ({
  uploading: "Uploading",
  processing: "Processing",
  active: "Ready",
  failed: "Failed",
  quarantined: "Quarantined",
  deleted: "Deleted",
}[status] || status);

export interface SecureFileUploaderProps {
  category: string;
  relatedEntityType?: string;
  relatedEntityId?: string | number;
  accept?: string[];
  maxFiles?: number;
  onUploaded?: (files: SecureFileMetadata[]) => void;
  className?: string;
}

export const SecureFileUploader = ({
  category,
  relatedEntityType,
  relatedEntityId,
  accept = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS],
  maxFiles = 5,
  onUploaded,
  className,
}: SecureFileUploaderProps) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [previews, setPreviews] = React.useState<string[]>([]);

  React.useEffect(() => {
    const objectUrls = selectedFiles
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => URL.createObjectURL(file));
    setPreviews(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const setFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).slice(0, maxFiles);
    const invalid = nextFiles.find((file) => {
      const lowerName = file.name.toLowerCase();
      return !accept.some((extension) => lowerName.endsWith(extension));
    });
    if (invalid) {
      setError("The selected file type is not supported.");
      return;
    }
    setError(null);
    setSelectedFiles(nextFiles);
  };

  const upload = async () => {
    if (!selectedFiles.length) return;
    abortRef.current = new AbortController();
    setIsUploading(true);
    setProgress(0);
    setError(null);
    try {
      const uploaded = await uploadSecureFiles({
        files: selectedFiles,
        category,
        relatedEntityType,
        relatedEntityId,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });
      setSelectedFiles([]);
      onUploaded?.(uploaded);
    } catch (uploadError: any) {
      if (uploadError?.name !== "AbortError") setError(uploadError?.message || "The upload could not be completed.");
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          setFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-4 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-primary" />
        <p className="text-sm font-medium">Drop files here or choose files</p>
        <p className="mt-1 text-xs text-muted-foreground">{accept.join(", ")} · up to {maxFiles} files</p>
        <input ref={inputRef} type="file" multiple={maxFiles > 1} accept={accept.join(",")} className="sr-only" onChange={(event) => event.target.files && setFiles(event.target.files)} />
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {previews.map((url) => (
            <img key={url} src={url} alt="Selected file preview" className="aspect-square rounded-md border object-cover" />
          ))}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="rounded-md border p-3">
          <div className="space-y-2">
            {selectedFiles.map((file) => (
              <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>
          {isUploading && <Progress value={progress} className="mt-3 h-2" />}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => isUploading ? abortRef.current?.abort() : setSelectedFiles([])} disabled={false}>
              <X className="mr-2 h-4 w-4" />
              {isUploading ? "Cancel" : "Clear"}
            </Button>
            <Button type="button" size="sm" onClick={upload} disabled={isUploading}>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export const ImageThumbnail = ({ file, alt }: { file: SecureFileMetadata; alt?: string }) => (
  <img
    src={thumbnailUrlFor(file)}
    alt={alt || file.originalName}
    loading="lazy"
    decoding="async"
    width={250}
    height={250}
    className="aspect-square rounded-md border object-cover"
  />
);

export const FileDownloadButton = ({ file }: { file: SecureFileMetadata }) => (
  <Button asChild variant="ghost" size="icon" aria-label={`Download ${file.originalName}`}>
    <a href={downloadUrlFor(file)} target="_blank" rel="noreferrer">
      <Download className="h-4 w-4" />
    </a>
  </Button>
);

export const ImagePreviewModal = ({ file, open, onOpenChange }: { file: SecureFileMetadata | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle className="truncate">{file?.originalName || "Image preview"}</DialogTitle>
      </DialogHeader>
      {file && <img src={previewUrlFor(file)} alt={file.originalName} className="max-h-[75vh] w-full rounded-md object-contain" />}
    </DialogContent>
  </Dialog>
);

export const DocumentAttachmentCard = ({ file }: { file: SecureFileMetadata }) => (
  <div className="flex items-center gap-3 rounded-md border p-3">
    <FileText className="h-5 w-5 shrink-0 text-primary" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{file.originalName}</p>
      <p className="text-xs text-muted-foreground">{file.mimeType} · {file.fileSizeLabel || formatFileSize(file.fileSize)}</p>
    </div>
    <Button asChild variant="ghost" size="icon" aria-label={`Preview ${file.originalName}`}>
      <a href={previewUrlFor(file)} target="_blank" rel="noreferrer">
        <Eye className="h-4 w-4" />
      </a>
    </Button>
    <FileDownloadButton file={file} />
  </div>
);

export const FileList = ({ files, onDelete, onReplace }: { files: SecureFileMetadata[]; onDelete?: (file: SecureFileMetadata) => void; onReplace?: (file: SecureFileMetadata) => void }) => (
  <div className="space-y-2">
    {files.map((file) => {
      const isImage = file.mimeType.startsWith("image/");
      return (
        <div key={file.id} className="flex items-center gap-3 rounded-md border p-3">
          {isImage ? <ImageThumbnail file={file} /> : <FileText className="h-9 w-9 shrink-0 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.originalName}</p>
            <p className="text-xs text-muted-foreground">{file.fileSizeLabel || formatFileSize(file.fileSize)} · {statusLabel(file.status)}</p>
          </div>
          {isImage && (
            <Button asChild variant="ghost" size="icon" aria-label={`View ${file.originalName}`}>
              <a href={previewUrlFor(file)} target="_blank" rel="noreferrer">
                <ImageIcon className="h-4 w-4" />
              </a>
            </Button>
          )}
          <FileDownloadButton file={file} />
          {file.permissions?.canReplace && onReplace && (
            <Button variant="ghost" size="icon" onClick={() => onReplace(file)} aria-label={`Replace ${file.originalName}`}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}
          {file.permissions?.canDelete && onDelete && (
            <Button variant="ghost" size="icon" onClick={() => onDelete(file)} aria-label={`Delete ${file.originalName}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    })}
  </div>
);

export const UploadProgress = ({ value }: { value: number }) => <Progress value={value} className="h-2" />;
