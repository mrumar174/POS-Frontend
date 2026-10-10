import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface ExportSheet {
  name: string;
  rows: Record<string, unknown>[];
}

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
app-report-bars, app-kpi, .kpi-grid { display: none !important; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background:#fff !important; margin:0; padding:0; color:#1c1a17; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
.print-head { border-bottom: 2px solid #1c1a17; margin-bottom: 12px; padding-bottom: 8px; }
.print-head h1 { font-size: 20px; margin: 0; }
.print-head p { margin: 2px 0 0; font-size: 11px; color: #666; }
.rpt-card, .kpi, .bars-card { box-shadow: none !important; break-inside: avoid; }
.rpt-table-wrap { overflow: visible !important; }
.rpt-table { font-size: 10.5px !important; }
.rpt-table thead { display: table-header-group; }
.rpt-table tr { break-inside: avoid; }
.kpi-grid { grid-template-columns: repeat(4, 1fr) !important; }
`;

@Injectable({ providedIn: 'root' })
export class ReportExportService {

  toExcel(fileName: string, sheets: ExportSheet[]): void {
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();

    for (const s of sheets) {
      const ws = XLSX.utils.json_to_sheet(s.rows);
      const keys = Object.keys(s.rows[0] ?? {});
      ws['!cols'] = keys.map(k => ({
        wch: Math.min(42, s.rows.reduce((w, r) => Math.max(w, String(r[k] ?? '').length), k.length) + 2)
      }));

      let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
      let i = 2;
      while (used.has(name)) name = `${name.slice(0, 28)} ${i++}`;
      used.add(name);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Prints only the report area (with a header) through a hidden iframe, so the app chrome is never printed. */
  print(title: string, subtitle: string, area: HTMLElement | null): void {
    if (!area) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    const head = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(n => n.outerHTML).join('');
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}<style>${PRINT_CSS}</style></head>
      <body><div class="print-head"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${area.innerHTML}</body></html>`);
    doc.close();

    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    const loaded = Promise.all(links.map(l => new Promise<void>(res => {
      l.addEventListener('load', () => res());
      l.addEventListener('error', () => res());
    })));

    Promise.race([loaded, new Promise<void>(res => setTimeout(res, 2500))]).then(() => {
      const w = iframe.contentWindow!;
      w.onafterprint = () => iframe.remove();
      setTimeout(() => { w.focus(); w.print(); }, 150);
      setTimeout(() => iframe.remove(), 120000);
    });
  }
}
