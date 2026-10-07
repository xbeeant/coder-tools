export interface PickOptions {
  accept?: string;
  multiple?: boolean;
}

/** 打开系统文件选择框，用户取消时返回空数组。 */
export function pickFiles({ accept, multiple = false }: PickOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(input.files ? Array.from(input.files) : []));
    // 取消选择时不会触发 change，依赖 blur 兜底并等待 focus 回归。
    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => finish(input.files ? Array.from(input.files) : []), 400);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFile(options: PickOptions = {}): Promise<File | null> {
  const files = await pickFiles({ ...options, multiple: false });
  return files[0] ?? null;
}

export function readAsText(file: File): Promise<string> {
  return file.text();
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取文件失败')));
    reader.readAsDataURL(file);
  });
}

export function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  html: 'text/html;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
};

export function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/** 生成带前缀与时间戳的导出文件名，例如 export-20260101-153012.json。 */
export function exportName(prefix: string, ext: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
  return `${prefix}-${stamp}.${ext}`;
}
